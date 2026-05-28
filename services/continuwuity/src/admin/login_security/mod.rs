mod commands;

use clap::Subcommand;
use conduwuit::Result;

use crate::admin_command_dispatch;

#[admin_command_dispatch]
#[derive(Debug, Subcommand)]
pub enum LoginSecurityCommand {
    /// List currently blocked IP addresses
    ListBlockedIps,

    /// Unblock a specific IP address
    UnblockIp {
        /// IP address to unblock
        ip_address: String,
    },

    /// Manually block an IP address
    BlockIp {
        /// IP address to block
        ip_address: String,
        /// Reason for blocking
        reason: String,
        /// Duration in seconds (defaults to config value)
        #[arg(long)]
        duration: Option<u64>,
    },

    /// List users automatically locked due to failed login attempts
    ListLockedUsers,

    /// Unlock a user (remove automatic lock from failed login attempts)
    UnlockUser {
        /// User ID to unlock (e.g., @user:server)
        user_id: String,
    },

    /// Manually lock a user
    LockUser {
        /// User ID to lock (e.g., @user:server)
        user_id: String,
        /// Reason for locking
        reason: String,
        /// Duration in seconds (defaults to config value)
        #[arg(long)]
        duration: Option<u64>,
    },

    /// View recent login attempts for a user or IP
    ViewAttempts {
        /// User ID to view attempts for (mutually exclusive with --ip)
        #[arg(long)]
        user: Option<String>,
        /// IP address to view attempts for (mutually exclusive with --user)
        #[arg(long)]
        ip: Option<String>,
        /// Maximum number of attempts to show
        #[arg(long, short, default_value = "50")]
        limit: usize,
    },

    /// Clear old login attempts (older than specified days)
    CleanupAttempts {
        /// Remove attempts older than this many days
        days: u32,
        /// Actually perform deletion (otherwise dry run)
        #[arg(long)]
        execute: bool,
    },
}