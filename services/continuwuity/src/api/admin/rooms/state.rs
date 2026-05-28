use axum::extract::State;
use conduwuit::{Err, Result, info, matrix::Event};
use futures::{StreamExt, TryStreamExt};
use ruma::events::AnyStateEvent;
use ruminuwuity::admin::continuwuity::rooms;

use crate::Ruma;

/// # `GET /_continuwuity/admin/v1/rooms/{room_id}/state`
///
/// Returns the full current state of a room (admin-level access).
pub(crate) async fn get_state(
	State(services): State<crate::State>,
	body: Ruma<rooms::state::v1::Request>,
) -> Result<rooms::state::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let room_state: Vec<ruma::serde::Raw<AnyStateEvent>> = services
		.rooms
		.state_accessor
		.room_state_full_pdus(&body.room_id)
		.map_ok(Event::into_format)
		.try_collect()
		.await?;

	let state: Vec<serde_json::Value> = room_state
		.iter()
		.filter_map(|raw| {
			let value = serde_json::to_value(raw).ok()?;
			let event_type = value.get("type")?.as_str()?;
			let state_key = value.get("state_key").and_then(|v| v.as_str()).unwrap_or("");
			let content = value.get("content")?.clone();

			Some(serde_json::json!({
				"type": event_type,
				"state_key": state_key,
				"content": content,
			}))
		})
		.collect();

	info!(%sender_user, "Retrieved {} state events for room {}", state.len(), body.room_id);
	Ok(rooms::state::v1::Response::new(state))
}
