use std::time::{Duration, UNIX_EPOCH};

use conduwuit::{Err, Result, info};

use crate::{admin_command, utils::parse_local_user_id};

#[admin_command]
pub(super) async fn list_blocked_ips(&self) -> Result {
    self.bail_restricted()?;
    
    let blocks = self.services.login_security.list_blocked_ips().await?;
    let now = conduwuit::utils::millis_since_unix_epoch();
    
    if blocks.is_empty() {
        return self.write_str("No IP addresses are currently blocked.").await;
    }
    
    let mut output = String::from("## Blocked IP addresses\n\n");
    for block in blocks {
        let remaining = if block.block_until > now {
            let secs = (block.block_until - now) / 1000;
            format!(" (expires in {} seconds)", secs)
        } else {
            " (EXPIRED)".to_string()
        };
        output.push_str(&format!("- `{}` - {}{}\n", block.ip_address, block.reason, remaining));
    }
    
    self.write_str(&output).await
}

#[admin_command]
pub(super) async fn unblock_ip(&self, ip_address: String) -> Result {
    self.bail_restricted()?;
    
    // Validate IP format (basic check)
    if ip_address.is_empty() || ip_address.contains('|') {
        return Err!("Invalid IP address format.");
    }
    
    self.services.login_security.unblock_ip(&ip_address).await?;
    info!("IP {} unblocked by admin", ip_address);
    
    self.write_str(&format!("IP `{}` has been unblocked.", ip_address)).await
}

#[admin_command]
pub(super) async fn block_ip(&self, ip_address: String, reason: String, duration: Option<u64>) -> Result {
    self.bail_restricted()?;
    
    // Validate IP format (basic check)
    if ip_address.is_empty() || ip_address.contains('|') {
        return Err!("Invalid IP address format.");
    }
    
    self.services.login_security.manually_block_ip(&ip_address, reason, duration).await?;
    info!("IP {} manually blocked by admin", ip_address);
    
    self.write_str(&format!("IP `{}` has been manually blocked.", ip_address)).await
}

#[admin_command]
pub(super) async fn lock_user(&self, user_id: String, reason: String, duration: Option<u64>) -> Result {
    self.bail_restricted()?;
    
    let user_id = parse_local_user_id(self.services, &user_id)?;
    
    self.services.login_security.manually_lock_user(&user_id, reason, duration).await?;
    info!("User {} manually locked by admin", user_id);
    
    self.write_str(&format!("User `{}` has been manually locked.", user_id)).await
}

#[admin_command]
pub(super) async fn list_locked_users(&self) -> Result {
    self.bail_restricted()?;
    
    let locks = self.services.login_security.list_locked_users().await?;
    let now = conduwuit::utils::millis_since_unix_epoch();
    
    if locks.is_empty() {
        return self.write_str("No users are automatically locked due to failed login attempts.").await;
    }
    
    let mut output = String::from("## Locked users\n\n");
    for lock in locks {
        let remaining = if lock.lock_until > now {
            let secs = (lock.lock_until - now) / 1000;
            format!(" (expires in {} seconds)", secs)
        } else {
            " (EXPIRED)".to_string()
        };
        let reason_str = lock.reason.as_ref().map(|r| format!(" - {}", r)).unwrap_or_default();
        let lock_type = if lock.failed_attempts == 0 { "manual" } else { "automatic" };
        output.push_str(&format!("- `{}` - {} lock (failed attempts: {}){}{}\n", 
            lock.user_id, lock_type, lock.failed_attempts, reason_str, remaining));
    }
    
    self.write_str(&output).await
}

#[admin_command]
pub(super) async fn unlock_user(&self, user_id: String) -> Result {
    self.bail_restricted()?;
    
    let user_id = parse_local_user_id(self.services, &user_id)?;
    
    self.services.login_security.unlock_user(&user_id).await?;
    info!("User {} unlocked from automatic lock by admin", user_id);
    
    self.write_str(&format!("User `{}` has been unlocked (automatic lock removed).", user_id)).await
}

#[admin_command]
pub(super) async fn view_attempts(
    &self,
    user: Option<String>,
    ip: Option<String>,
    limit: usize,
) -> Result {
    self.bail_restricted()?;
    
    if user.is_none() && ip.is_none() {
        return Err!("Please specify either --user or --ip.");
    }
    if user.is_some() && ip.is_some() {
        return Err!("Please specify only one of --user or --ip.");
    }
    
    let mut output = String::new();
    if let Some(user_str) = user {
        let user_id = parse_local_user_id(self.services, &user_str)?;
        let attempts = self.services.login_security.get_login_attempts_for_user(&user_id, limit).await?;
        output.push_str(&format!("## Recent login attempts for `{}`\n\n", user_id));
        for attempt in attempts {
            let systime = UNIX_EPOCH + Duration::from_millis(attempt.timestamp);
            let time_str = format!("{:?}", systime);
            let status = if attempt.successful { "✅" } else { "❌" };
            output.push_str(&format!("- {} {} from `{}` (agent: {})\n", 
                status, time_str, attempt.ip_address, 
                attempt.user_agent.as_deref().unwrap_or("unknown")));
        }
    } else if let Some(ip_addr) = ip {
        let attempts = self.services.login_security.get_login_attempts_for_ip(&ip_addr, limit).await?;
        output.push_str(&format!("## Recent login attempts from IP `{}`\n\n", ip_addr));
        for attempt in attempts {
            let systime = UNIX_EPOCH + Duration::from_millis(attempt.timestamp);
            let time_str = format!("{:?}", systime);
            let status = if attempt.successful { "✅" } else { "❌" };
            output.push_str(&format!("- {} {} for `{}` (agent: {})\n", 
                status, time_str, attempt.user_id,
                attempt.user_agent.as_deref().unwrap_or("unknown")));
        }
    }
    
    if output.is_empty() {
        output.push_str("No login attempts found.");
    }
    
    self.write_str(&output).await
}

#[admin_command]
pub(super) async fn cleanup_attempts(&self, days: u32, execute: bool) -> Result {
    self.bail_restricted()?;
    
    let cutoff = conduwuit::utils::millis_since_unix_epoch() - (days as u64 * 24 * 60 * 60 * 1000);
    let systime = UNIX_EPOCH + Duration::from_millis(cutoff);
    let cutoff_formatted = format!("{:?}", systime);
    
    if !execute {
        // Dry run: show what would be deleted
        return self.write_str(&format!(
            "Dry run: would delete login attempts older than {} ({} days ago).\n\
             Use --execute to actually delete.\n\
             Note: This operation will scan all login attempts, which may be slow on large databases.",
            cutoff_formatted, days
        )).await;
    }
    
    // Actually delete old attempts
    let deleted = self.services.login_security.delete_attempts_older_than(cutoff).await?;
    
    self.write_str(&format!(
        "Deleted {} login attempts older than {} ({} days ago).",
        deleted, cutoff_formatted, days
    )).await
}