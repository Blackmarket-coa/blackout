use std::sync::Arc;

use async_trait::async_trait;
use conduwuit::{Err, Result, debug, utils};
use database::{Deserialized, Json, Map};
#[allow(unused_imports)]
use futures::StreamExt;
use ruma::{OwnedUserId, UserId};
use serde::{Deserialize, Serialize};
use serde_json;

use crate::{Dep, admin, config, users};

// Record of a login attempt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginAttempt {
    pub user_id: String,
    pub ip_address: String,
    pub timestamp: u64,
    pub successful: bool,
    pub user_agent: Option<String>,
}

// IP block record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpBlock {
    pub ip_address: String,
    pub block_until: u64,
    pub reason: String,
    #[serde(default)]
    pub block_count: u32,
    #[serde(default)]
    pub created_at: u64,
}

// User login lock record (automatic lock due to failed attempts)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserLoginLock {
    pub user_id: String,
    pub lock_until: u64,
    pub failed_attempts: u32,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub lock_count: u32,
    #[serde(default)]
    pub created_at: u64,
}

pub struct Service {
    config: Dep<config::Service>,
    users: Dep<users::Service>,
    admin: Dep<admin::Service>,
    unknown_user_id: OwnedUserId,
    db: Data,
}

struct Data {
    login_attempts: Arc<Map>,
    ip_blocks: Arc<Map>,
    user_login_locks: Arc<Map>,
}

#[async_trait]
impl crate::Service for Service {
    fn build(args: crate::Args<'_>) -> Result<Arc<Self>> {
        let unknown_user_id = UserId::parse(format!("@unknown:{}", args.server.config.server_name))
            .expect("valid unknown user id");
        
        Ok(Arc::new(Self {
            config: args.depend::<config::Service>("config"),
            users: args.depend::<users::Service>("users"),
            admin: args.depend::<admin::Service>("admin"),
            unknown_user_id,
            db: Data {
                login_attempts: args.db["login_attempts"].clone(),
                ip_blocks: args.db["ip_blocks"].clone(),
                user_login_locks: args.db["user_login_locks"].clone(),
            },
        }))
    }

    fn name(&self) -> &str {
        crate::service::make_name(std::module_path!())
    }
}

impl Service {
    // Width for zero-padded timestamps (u64 max: 18446744073709551615 = 20 digits).
    const TIMESTAMP_WIDTH: usize = 20;
    
    // Format timestamp as zero-padded string to ensure lexicographic ordering matches
    // chronological ordering when used in database keys.
    pub(crate) fn format_timestamp(timestamp: u64) -> String {
        format!("{:0>width$}", timestamp, width = Self::TIMESTAMP_WIDTH)
    }

    // Format duration in seconds to human-readable string (seconds, minutes, hours)
    fn format_duration(seconds: u64) -> String {
        if seconds < 60 {
            format!("{} seconds", seconds)
        } else if seconds < 3600 {
            format!("{} minutes", seconds / 60)
        } else {
            format!("{} hours", seconds / 3600)
        }
    }

    // Get graduated duration based on block/lock count
    fn get_graduated_duration(&self, count: u32) -> u64 {
        let durations = &self.config.login_security.graduated_lock_durations;
        if durations.is_empty() {
            return self.config.login_security.lock_duration_seconds;
        }
        let index = (count as usize).saturating_sub(1);
        if index >= durations.len() {
            *durations.last().unwrap()
        } else {
            durations[index]
        }
    }

    // Check if a login attempt should be allowed
    pub async fn check_login_allowed(
        &self,
        user_id: &UserId,
        ip_address: &str,
    ) -> Result<()> {
        // Check IP block
        if self.is_ip_blocked(ip_address).await? {
            return Err!(Request(Forbidden("IP address is temporarily blocked")));
        }

        // Check user lock (both manual and automatic)
        if self.is_user_locked(user_id).await? {
            return Err!(Request(Forbidden("Account is temporarily locked")));
        }

        // Check rate limits
        self.check_rate_limits(user_id, ip_address).await?;

        Ok(())
    }

    // Check if an IP is allowed to make requests (for endpoints without user authentication)
    pub async fn check_ip_allowed(
        &self,
        ip_address: &str,
    ) -> Result<()> {
        // Check IP block
        if self.is_ip_blocked(ip_address).await? {
            return Err!(Request(Forbidden("IP address is temporarily blocked")));
        }

        // Check IP rate limits only (no user lock checks)
        if self.config.login_security.enable_ip_rate_limiting {
            let window_start = utils::millis_since_unix_epoch()
                - self.config.login_security.attempt_window_seconds * 1000;
            let ip_failed = self.count_recent_failed_attempts_ip(ip_address, window_start).await?;
            if ip_failed >= self.config.login_security.max_failed_attempts_per_ip {
                return Err!(Request(Forbidden("Too many failed attempts from this IP")));
            }
        }

        Ok(())
    }

    // Record a login attempt
    pub async fn record_attempt(
        &self,
        user_id: &UserId,
        ip_address: &str,
        successful: bool,
        user_agent: Option<&str>,
    ) -> Result<()> {
        let timestamp = utils::millis_since_unix_epoch();
        let attempt = LoginAttempt {
            user_id: user_id.to_string(),
            ip_address: ip_address.to_string(),
            timestamp,
            successful,
            user_agent: user_agent.map(|s| s.to_string()),
        };

        // Store attempt entries for user and IP if logging enabled or attempt failed
        if self.config.login_security.log_all_attempts || !successful {
            let user_key = self.user_attempt_key(user_id, timestamp, ip_address);
            let ip_key = self.ip_attempt_key(ip_address, timestamp, user_id);
            self.db.login_attempts.put(user_key, Json(&attempt));
            self.db.login_attempts.put(ip_key, Json(&attempt));
        }

        if !successful {
            // Increment failed attempt counters
            let user_failed = self.increment_user_failed_attempts(user_id).await?;
            let ip_failed = self.increment_ip_failed_attempts(ip_address).await?;

            // Send admin notification for failed attempt
            self.send_failed_login_notice(user_id, ip_address, user_failed, ip_failed).await;

            if self.config.login_security.enable_user_rate_limiting && user_failed >= self.config.login_security.max_failed_attempts_per_user {
                self.lock_user(user_id, user_failed).await?;
            }

            if self.config.login_security.enable_ip_rate_limiting && ip_failed >= self.config.login_security.max_failed_attempts_per_ip {
                self.block_ip(ip_address).await?;
            }
        } else {
            // Reset counters on successful login
            self.reset_user_failed_attempts(user_id).await?;
            self.reset_ip_failed_attempts(ip_address).await?;
        }

        Ok(())
    }

    // Send admin notification for a failed login attempt
    async fn send_failed_login_notice(&self, user_id: &UserId, ip_address: &str, user_failed: u32, ip_failed: u32) {
        if self.config.admin_room_notices {
            let notice = format!(
                "Failed login attempt for user {} from IP {}. User has {} failed attempts, IP has {} failed attempts.",
                user_id, ip_address, user_failed, ip_failed
            );
            self.admin.notice(&notice).await;
        }
    }

    // Record a failed IP-only attempt (for endpoints without user authentication)
    pub async fn record_ip_only_failed_attempt(
        &self,
        ip_address: &str,
        user_agent: Option<&str>,
    ) -> Result<()> {
        let timestamp = utils::millis_since_unix_epoch();
        let attempt = LoginAttempt {
            user_id: self.unknown_user_id.to_string(),
            ip_address: ip_address.to_string(),
            timestamp,
            successful: false,
            user_agent: user_agent.map(|s| s.to_string()),
        };

        // Store attempt entry for IP if logging enabled
        if self.config.login_security.log_all_attempts {
            let ip_key = self.ip_attempt_key(ip_address, timestamp, &self.unknown_user_id);
            self.db.login_attempts.put(ip_key, Json(&attempt));
        }

        // Increment IP failed attempt counter
        let ip_failed = self.increment_ip_failed_attempts(ip_address).await?;

        // Send admin notification for failed attempt
        if self.config.admin_room_notices {
            let notice = format!(
                "Failed IP-only attempt from IP {}. IP has {} failed attempts.",
                ip_address, ip_failed
            );
            self.admin.notice(&notice).await;
        }

        if self.config.login_security.enable_ip_rate_limiting && ip_failed >= self.config.login_security.max_failed_attempts_per_ip {
            self.block_ip(ip_address).await?;
        }

        Ok(())
    }

    // List all currently blocked IP addresses (excluding expired blocks)
    // Expired blocks are automatically removed from the database.
    pub async fn list_blocked_ips(&self) -> Result<Vec<IpBlock>> {
        use futures::StreamExt;
        let mut blocks = Vec::new();
        let now = utils::millis_since_unix_epoch();
        let mut stream = self.db.ip_blocks.raw_stream();
        while let Some(entry) = stream.next().await {
            let (key, value) = entry?;
            let block: IpBlock = serde_json::from_slice(&value)?;
            if block.block_until > now {
                blocks.push(block);
            } else {
                // Remove expired block
                let ip = String::from_utf8_lossy(&key).into_owned();
                self.db.ip_blocks.remove(&ip);
            }
        }
        Ok(blocks)
    }

    // Remove block for an IP address
    pub async fn unblock_ip(&self, ip_address: &str) -> Result<()> {
        self.db.ip_blocks.remove(ip_address);
        
        // Send admin notification
        if self.config.admin_room_notices {
            let notice = format!("IP address {} has been unblocked.", ip_address);
            self.admin.notice(&notice).await;
        }
        
        Ok(())
    }

    // Manually block an IP address with custom reason and optional duration
    pub async fn manually_block_ip(&self, ip_address: &str, reason: String, duration_seconds: Option<u64>) -> Result<()> {
        let now = utils::millis_since_unix_epoch();
        
        // Get existing block to determine count
        let mut block_count = 1;
        let existing_block = self.db.ip_blocks.get(ip_address).await.deserialized::<IpBlock>().ok();
        
        if let Some(existing) = existing_block {
            // Reset count if block is very old (more than 24 hours since creation)
            if now - existing.created_at > 24 * 3600 * 1000 {
                block_count = 1;
            } else {
                block_count = existing.block_count.saturating_add(1);
            }
        }
        
        let duration = duration_seconds.unwrap_or(self.config.login_security.lock_duration_seconds);
        let block_until = now + duration * 1000;
        let block = IpBlock {
            ip_address: ip_address.to_string(),
            block_until,
            reason: reason.clone(),
            block_count,
            created_at: now,
        };
        self.db.ip_blocks.put(ip_address, Json(&block));
        debug!("Manually blocked IP {} until {} (count: {}, duration: {}s): {}", ip_address, block_until, block_count, duration, block.reason);
        
        // Send admin notification
        if self.config.admin_room_notices {
            let notice = format!(
                "IP address {} has been manually blocked for {} (block count: {}): {}",
                ip_address, Self::format_duration(duration), block_count, reason
            );
            self.admin.notice(&notice).await;
        }
        
        Ok(())
    }

    // Manually lock a user with custom reason and optional duration
    pub async fn manually_lock_user(&self, user_id: &UserId, reason: String, duration_seconds: Option<u64>) -> Result<()> {
        let now = utils::millis_since_unix_epoch();
        
        // Get existing lock to determine count
        let mut lock_count = 1;
        let existing_lock = self.db.user_login_locks.get(user_id).await.deserialized::<UserLoginLock>().ok();
        
        if let Some(existing) = existing_lock {
            // Reset count if lock is very old (more than 24 hours since creation)
            if now - existing.created_at > 24 * 3600 * 1000 {
                lock_count = 1;
            } else {
                lock_count = existing.lock_count.saturating_add(1);
            }
        }
        
        let duration = duration_seconds.unwrap_or(self.config.login_security.lock_duration_seconds);
        let lock_until = now + duration * 1000;
        let lock = UserLoginLock {
            user_id: user_id.to_string(),
            lock_until,
            failed_attempts: 0, // 0 indicates manual lock
            reason: Some(reason.clone()),
            lock_count,
            created_at: now,
        };
        self.db.user_login_locks.put(user_id, Json(&lock));
        debug!("Manually locked user {} until {} (count: {}, duration: {}s): {}", user_id, lock_until, lock_count, duration, lock.reason.as_deref().unwrap_or(""));
        
        // Send admin notification
        if self.config.admin_room_notices {
            let notice = format!(
                "User {} has been manually locked for {} (lock count: {}): {}",
                user_id, Self::format_duration(duration), lock_count, reason
            );
            self.admin.notice(&notice).await;
        }
        
        Ok(())
    }

    // List all automatically locked users (excluding expired locks)
    // Expired locks are automatically removed from the database.
    pub async fn list_locked_users(&self) -> Result<Vec<UserLoginLock>> {
        use futures::StreamExt;
        let mut locks = Vec::new();
        let now = utils::millis_since_unix_epoch();
        let mut stream = self.db.user_login_locks.raw_stream();
        while let Some(entry) = stream.next().await {
            let (key, value) = entry?;
            let lock: UserLoginLock = serde_json::from_slice(&value)?;
            if lock.lock_until > now {
                locks.push(lock);
            } else {
                // Remove expired lock
                let user_id = String::from_utf8_lossy(&key).into_owned();
                self.db.user_login_locks.remove(&user_id);
            }
        }
        Ok(locks)
    }

    // Remove automatic lock for a user (does not affect manual locks)
    pub async fn unlock_user(&self, user_id: &UserId) -> Result<()> {
        self.db.user_login_locks.remove(user_id);
        
        // Send admin notification
        if self.config.admin_room_notices {
            let notice = format!("User {} has been unlocked.", user_id);
            self.admin.notice(&notice).await;
        }
        
        Ok(())
    }

    // Get recent login attempts for a user
    pub async fn get_login_attempts_for_user(&self, user_id: &UserId, limit: usize) -> Result<Vec<LoginAttempt>> {
        let prefix = format!("user|{}|", user_id);
        self.get_login_attempts_with_prefix(&prefix, limit).await
    }

    // Get recent login attempts for an IP address
    pub async fn get_login_attempts_for_ip(&self, ip_address: &str, limit: usize) -> Result<Vec<LoginAttempt>> {
        let prefix = format!("ip|{}|", ip_address);
        self.get_login_attempts_with_prefix(&prefix, limit).await
    }

    // Delete login attempts older than the specified timestamp
    pub async fn delete_attempts_older_than(&self, cutoff_timestamp: u64) -> Result<usize> {
        use futures::StreamExt;
        let mut deleted = 0;
        let mut keys_to_delete = Vec::new();
        
        // Scan all login attempts
        let mut stream = self.db.login_attempts.raw_stream();
        while let Some(entry) = stream.next().await {
            let (key, _) = entry?;
            // Parse timestamp from key: prefix|identifier|timestamp|rest
            let key_str = String::from_utf8_lossy(&key);
            let parts: Vec<&str> = key_str.split('|').collect();
            if parts.len() < 4 {
                continue;
            }
            let timestamp_str = parts[2];
            let timestamp = timestamp_str.parse::<u64>().unwrap_or(0);
            if timestamp < cutoff_timestamp {
                keys_to_delete.push(key);
            }
        }
        
        // Delete collected keys
        for key in keys_to_delete {
            self.db.login_attempts.remove(&key);
            deleted += 1;
        }
        
        Ok(deleted)
    }

    async fn get_login_attempts_with_prefix(&self, prefix: &str, limit: usize) -> Result<Vec<LoginAttempt>> {
        use futures::StreamExt;
        let mut attempts = Vec::new();
        let mut stream = self.db.login_attempts.raw_stream_prefix(prefix.as_bytes());
        while let Some(entry) = stream.next().await {
            if attempts.len() >= limit {
                break;
            }
            let (_, value) = entry?;
            let attempt: LoginAttempt = serde_json::from_slice(&value)?;
            attempts.push(attempt);
        }
        // Reverse to get newest first (since keys are ascending by timestamp)
        attempts.reverse();
        Ok(attempts)
    }

    async fn is_ip_blocked(&self, ip_address: &str) -> Result<bool> {
        match self.db.ip_blocks.get(ip_address).await.deserialized::<IpBlock>() {
            Ok(block) => {
                let now = utils::millis_since_unix_epoch();
                Ok(now < block.block_until)
            }
            Err(e) if e.is_not_found() => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    async fn is_user_locked(&self, user_id: &UserId) -> Result<bool> {
        // Check manual lock first
        if self.users.is_locked(user_id).await? {
            return Ok(true);
        }
        // Check automatic lock
        match self.db.user_login_locks.get(user_id).await.deserialized::<UserLoginLock>() {
            Ok(lock) => {
                let now = utils::millis_since_unix_epoch();
                Ok(now < lock.lock_until)
            }
            Err(e) if e.is_not_found() => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    async fn check_rate_limits(&self, user_id: &UserId, ip_address: &str) -> Result<()> {
        let config = &self.config;
        let window_start = utils::millis_since_unix_epoch()
            - config.login_security.attempt_window_seconds * 1000;

        if config.login_security.enable_user_rate_limiting {
            let user_failed = self.count_recent_failed_attempts_user(user_id, window_start).await?;
            if user_failed >= config.login_security.max_failed_attempts_per_user {
                return Err!(Request(Forbidden("Too many failed login attempts for this user")));
            }
        }

        if config.login_security.enable_ip_rate_limiting {
            let ip_failed = self.count_recent_failed_attempts_ip(ip_address, window_start).await?;
            if ip_failed >= config.login_security.max_failed_attempts_per_ip {
                return Err!(Request(Forbidden("Too many failed login attempts from this IP")));
            }
        }

        Ok(())
    }

    async fn increment_user_failed_attempts(&self, user_id: &UserId) -> Result<u32> {
        let config = &self.config;
        let window_start = utils::millis_since_unix_epoch()
            - config.login_security.attempt_window_seconds * 1000;
        self.count_recent_failed_attempts_user(user_id, window_start).await
    }

    async fn increment_ip_failed_attempts(&self, ip_address: &str) -> Result<u32> {
        let config = &self.config;
        let window_start = utils::millis_since_unix_epoch()
            - config.login_security.attempt_window_seconds * 1000;
        self.count_recent_failed_attempts_ip(ip_address, window_start).await
    }

    async fn count_recent_failed_attempts_user(&self, user_id: &UserId, window_start: u64) -> Result<u32> {
        let prefix = format!("user|{}|", user_id);
        self.count_recent_failed_attempts_with_prefix(&prefix, window_start).await
    }

    async fn count_recent_failed_attempts_ip(&self, ip_address: &str, window_start: u64) -> Result<u32> {
        let prefix = format!("ip|{}|", ip_address);
        self.count_recent_failed_attempts_with_prefix(&prefix, window_start).await
    }

    async fn count_recent_failed_attempts_with_prefix(&self, prefix: &str, window_start: u64) -> Result<u32> {
        use futures::StreamExt;
        let mut count = 0;
        let mut stream = self.db.login_attempts.raw_stream_prefix(prefix.as_bytes());
        while let Some(entry) = stream.next().await {
            let (key, value) = entry?;
            // Parse timestamp from key: prefix|identifier|timestamp|rest
            // key is bytes, convert to string lossy
            let key_str = String::from_utf8_lossy(&key);
            let parts: Vec<&str> = key_str.split('|').collect();
            if parts.len() < 4 {
                continue;
            }
            let timestamp_str = parts[2];
            let timestamp = timestamp_str.parse::<u64>().unwrap_or(0);
            if timestamp < window_start {
                // Older than window. Since timestamps are zero-padded to ensure chronological ordering,
                // subsequent keys with the same prefix will have larger timestamps.
                // Continue scanning because newer timestamps may still be within window.
                continue;
            }
            // Deserialize value to check if attempt was successful
            let attempt: LoginAttempt = serde_json::from_slice(&value)?;
            if !attempt.successful {
                count += 1;
            }
        }
        Ok(count)
    }

    async fn delete_attempts_with_prefix(&self, prefix: &str) -> Result<()> {
        use futures::StreamExt;
        let mut keys = Vec::new();
        let mut stream = self.db.login_attempts.raw_stream_prefix(prefix.as_bytes());
        while let Some(entry) = stream.next().await {
            let (key, _) = entry?;
            keys.push(key);
        }
        for key in keys {
            self.db.login_attempts.remove(&key);
        }
        Ok(())
    }

    async fn lock_user(&self, user_id: &UserId, failed_attempts: u32) -> Result<()> {
        let now = utils::millis_since_unix_epoch();
        
        // Get existing lock to determine count
        let mut lock_count = 1;
        let existing_lock = self.db.user_login_locks.get(user_id).await.deserialized::<UserLoginLock>().ok();
        
        if let Some(existing) = existing_lock {
            // Reset count if lock is very old (more than 24 hours since creation)
            if now - existing.created_at > 24 * 3600 * 1000 {
                lock_count = 1;
            } else {
                lock_count = existing.lock_count.saturating_add(1);
            }
        }
        
        // Calculate duration based on graduated scale
        let duration_seconds = self.get_graduated_duration(lock_count);
        let lock_until = now + duration_seconds * 1000;
        
        let lock = UserLoginLock {
            user_id: user_id.to_string(),
            lock_until,
            failed_attempts,
            reason: Some("too_many_failed_attempts".to_string()),
            lock_count,
            created_at: now,
        };
        self.db.user_login_locks.put(user_id, Json(&lock));
        debug!("Locked user {} until {} (failed attempts: {}, lock count: {}, duration: {}s)", user_id, lock_until, failed_attempts, lock_count, duration_seconds);
        
        // Send admin notification
        if self.config.admin_room_notices {
            let notice = format!(
                "User {} has been automatically locked for {} due to {} failed login attempts. (Lock count: {})",
                user_id, Self::format_duration(duration_seconds), failed_attempts, lock_count
            );
            self.admin.notice(&notice).await;
        }
        
        Ok(())
    }

    async fn block_ip(&self, ip_address: &str) -> Result<()> {
        let now = utils::millis_since_unix_epoch();
        
        // Get existing block to determine count
        let mut block_count = 1;
        let existing_block = self.db.ip_blocks.get(ip_address).await.deserialized::<IpBlock>().ok();
        
        if let Some(existing) = existing_block {
            // Reset count if block is very old (more than 24 hours since creation)
            if now - existing.created_at > 24 * 3600 * 1000 {
                block_count = 1;
            } else {
                block_count = existing.block_count.saturating_add(1);
            }
        }
        
        // Calculate duration based on graduated scale
        let duration_seconds = self.get_graduated_duration(block_count);
        let block_until = now + duration_seconds * 1000;
        
        let block = IpBlock {
            ip_address: ip_address.to_string(),
            block_until,
            reason: "too_many_failed_attempts".to_string(),
            block_count,
            created_at: now,
        };
        self.db.ip_blocks.put(ip_address, Json(&block));
        debug!("Blocked IP {} until {} (count: {}, duration: {}s)", ip_address, block_until, block_count, duration_seconds);
        
        // Send admin notification
        if self.config.admin_room_notices {
            let notice = format!(
                "IP address {} has been automatically blocked for {} due to too many failed login attempts. (Block count: {})",
                ip_address, Self::format_duration(duration_seconds), block_count
            );
            self.admin.notice(&notice).await;
        }
        
        Ok(())
    }

    async fn reset_user_failed_attempts(&self, user_id: &UserId) -> Result<()> {
        let prefix = format!("user|{}|", user_id);
        self.delete_attempts_with_prefix(&prefix).await
    }

    async fn reset_ip_failed_attempts(&self, ip_address: &str) -> Result<()> {
        let prefix = format!("ip|{}|", ip_address);
        self.delete_attempts_with_prefix(&prefix).await
    }

    // Generate database key for a user login attempt.
    // Format: "user|{user_id}|{timestamp}|{ip_address}"
    // Timestamp is zero-padded to ensure chronological ordering in lexicographic sort.
    fn user_attempt_key(&self, user_id: &UserId, timestamp: u64, ip_address: &str) -> String {
        format!("user|{}|{}|{}", user_id, Self::format_timestamp(timestamp), ip_address)
    }

    // Generate database key for an IP login attempt.
    // Format: "ip|{ip_address}|{timestamp}|{user_id}"
    // Timestamp is zero-padded to ensure chronological ordering in lexicographic sort.
    fn ip_attempt_key(&self, ip_address: &str, timestamp: u64, user_id: &UserId) -> String {
        format!("ip|{}|{}|{}", ip_address, Self::format_timestamp(timestamp), user_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_timestamp_ordering() {
        // Ensure zero-padded timestamps maintain chronological ordering
        let timestamps = vec![1, 10, 100, 1000, 9999, 10000, 18446744073709551615];
        let formatted: Vec<String> = timestamps.iter().map(|&ts| Service::format_timestamp(ts)).collect();
        
        // Check that formatted strings are equal length
        assert!(formatted.iter().all(|s| s.len() == Service::TIMESTAMP_WIDTH));
        
        // Check that lexicographic ordering matches numeric ordering
        for i in 0..timestamps.len() {
            for j in 0..timestamps.len() {
                let cmp_num = timestamps[i].cmp(&timestamps[j]);
                let cmp_str = formatted[i].cmp(&formatted[j]);
                assert_eq!(cmp_num, cmp_str, "Ordering mismatch for {} vs {}", timestamps[i], timestamps[j]);
            }
        }
    }
}