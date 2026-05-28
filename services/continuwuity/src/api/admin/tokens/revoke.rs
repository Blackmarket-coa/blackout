use axum::extract::State;
use conduwuit::{Err, Result, info};
use ruminuwuity::admin::continuwuity::tokens;

use crate::Ruma;

/// # `DELETE /_continuwuity/admin/v1/registration_tokens/{token}`
///
/// Revoke a registration token.
pub(crate) async fn revoke_token(
	State(services): State<crate::State>,
	body: Ruma<tokens::revoke::v1::Request>,
) -> Result<tokens::revoke::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let valid_token = services
		.registration_tokens
		.validate_token(body.token.clone())
		.await;

	match valid_token {
		Some(t) => {
			services.registration_tokens.revoke_token(t)?;
			info!(%sender_user, "Revoked registration token");
			Ok(tokens::revoke::v1::Response::new())
		},
		None => Err!(Request(NotFound("Registration token not found or already revoked"))),
	}
}
