use axum::extract::State;
use conduwuit::{Err, Result, info};
use ruminuwuity::admin::continuwuity::tokens;

use crate::Ruma;

/// # `POST /_continuwuity/admin/v1/registration_tokens/new`
///
/// Issue a new registration token.
pub(crate) async fn issue_token(
	State(services): State<crate::State>,
	body: Ruma<tokens::issue::v1::Request>,
) -> Result<tokens::issue::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let expires = if let Some(expiry_time) = body.expiry_time {
		Some(conduwuit_service::registration_tokens::TokenExpires::AfterTime(
			std::time::UNIX_EPOCH + std::time::Duration::from_millis(expiry_time),
		))
	} else if let Some(uses) = body.uses_allowed {
		Some(conduwuit_service::registration_tokens::TokenExpires::AfterUses(uses))
	} else {
		None
	};

	let (token, _info) = services
		.registration_tokens
		.issue_token(sender_user.clone().into(), expires);

	let expiry_time = body.expiry_time;

	info!(%sender_user, "Issued registration token");
	Ok(tokens::issue::v1::Response::new(token, expiry_time))
}
