use axum::extract::State;
use conduwuit::{Err, Result, info};
use conduwuit::utils::ReadyExt;
use futures::StreamExt;
use ruminuwuity::admin::continuwuity::users;

use crate::Ruma;

/// # `GET /_continuwuity/admin/v1/users`
///
/// List local users, optionally filtered by search term.
pub(crate) async fn list_users(
	State(services): State<crate::State>,
	body: Ruma<users::list::v1::Request>,
) -> Result<users::list::v1::Response> {
	let sender_user = body.identity.expect_sender_user()?;
	if !services.users.is_admin(sender_user).await {
		return Err!(Request(Forbidden("Only server administrators can use this endpoint")));
	}

	let limit = body.limit.unwrap_or(50).min(500) as usize;
	let search = body.search.as_deref().map(|s| s.to_lowercase());

	let mut total: u64 = 0;
	let mut users_out: Vec<users::list::v1::UserInfo> = Vec::new();

	let stream = services.users.list_local_users();
	let mut stream = Box::pin(stream);
	while let Some(user_id) = stream.next().await {
		let id_str = user_id.to_string();

		if let Some(ref search_term) = search {
			if !id_str.to_lowercase().contains(search_term) {
				continue;
			}
		}

		total += 1;

		if users_out.len() < limit {
			let displayname = services.users.displayname(&user_id).await.ok();
			let deactivated = services.users.is_deactivated(&user_id).await.unwrap_or(false);
			let admin = services.users.is_admin(&user_id).await;

			users_out.push(users::list::v1::UserInfo {
				user_id: id_str,
				displayname,
				deactivated,
				admin,
			});
		}
	}

	info!(%sender_user, "Listed {total} users");
	Ok(users::list::v1::Response::new(users_out, total))
}
