use axum::extract::State;
use conduwuit::{Err, Result, info};
use conduwuit::utils::ReadyExt;
use futures::StreamExt;
use ruma::OwnedRoomId;
use ruminuwuity::admin::continuwuity::users;

use crate::Ruma;

/// # `POST /_continuwuity/admin/v1/deactivate/{user_id}`
///
/// Deactivate a local user. If `erase` is true, also force the
/// user to leave all joined rooms.
pub(crate) async fn deactivate_user(
	State(services): State<crate::State>,
	body: Ruma<users::deactivate::v1::Request>,
) -> Result<users::deactivate::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let target_user = &body.user_id;

	if body.erase {
		let all_joined_rooms: Vec<OwnedRoomId> = services
			.rooms
			.state_cache
			.rooms_joined(target_user)
			.map(Into::into)
			.collect()
			.await;

		for room_id in &all_joined_rooms {
			let _ = crate::client::leave_room(&services, target_user, room_id, None).await;
		}
	}

	services.users.deactivate_account(target_user).await?;

	info!(%sender_user, "Deactivated user {}", target_user);
	Ok(users::deactivate::v1::Response::new(true))
}
