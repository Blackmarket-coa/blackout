use std::fmt::Write as _;

use axum::{Json, extract::State};
use conduwuit::{Err, Result, info, utils};
use hmac::{Hmac, KeyInit, Mac};
use ruma::{OwnedDeviceId, OwnedUserId, events::push_rules::PushRulesEvent, push};
use serde::Deserialize;
use service::users::HashedPassword;
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

const DEVICE_ID_LENGTH: usize = 10;
const TOKEN_LENGTH: usize = 32;

#[derive(Debug, Deserialize)]
pub struct RegisterBody {
	pub nonce: String,
	pub username: String,
	pub password: String,
	#[serde(default)]
	pub admin: bool,
	pub mac: String,
}

#[derive(Debug, serde::Serialize)]
pub struct RegisterResponse {
	pub user_id: String,
	pub home_server: String,
	pub access_token: String,
}

/// # `POST /_continuwuity/admin/v1/register`
///
/// Synapse-compatible shared-secret user registration.
/// Authenticated via HMAC-SHA1, not an access token.
pub(crate) async fn register_with_shared_secret(
	State(services): State<crate::State>,
	Json(body): Json<RegisterBody>,
) -> Result<Json<RegisterResponse>> {
	let secret = services.server.config.registration_shared_secret.as_deref();
	let Some(secret) = secret else {
		return Err!(Request(Unknown("Shared-secret registration is not configured. Set registration_shared_secret in the server config.")));
	};

	if secret.is_empty() {
		return Err!(Request(Unknown("Shared-secret registration is not configured.")));
	}

	let localpart = body.username.trim();
	if localpart.is_empty() {
		return Err!(Request(InvalidParam("Username is required")));
	}
	if localpart.len() > 255 {
		return Err!(Request(InvalidParam("Username too long")));
	}
	if localpart.contains([':', '@', '/', '\\']) {
		return Err!(Request(InvalidParam("Username contains invalid characters")));
	}

	let admin_str = if body.admin { "admin" } else { "notadmin" };
	let mac_input = format!("{}\x00{}\x00{}\x00{}", body.nonce, localpart, body.password, admin_str);

	let mut mac = HmacSha1::new_from_slice(secret.as_bytes())
		.expect("HMAC can take key of any size");
	mac.update(mac_input.as_bytes());
	let expected_mac = hex::encode(mac.finalize().into_bytes());

	if expected_mac != body.mac {
		return Err!(Request(Forbidden("HMAC signature mismatch")));
	}

	let server_name = &services.server.name;
	let user_id = match OwnedUserId::try_from(format!("@{localpart}:{server_name}")) {
		Ok(id) => id,
		Err(_) => return Err!(Request(InvalidParam("Invalid username"))),
	};

	if services.users.exists(&user_id).await {
		return Err!(Conflict("User already exists"));
	}

	// Create user (bypass UIA — same as admin commands)
	services
		.users
		.create(&user_id, Some(HashedPassword::new(&body.password)?))
		.await?;

	// Set display name
	let mut displayname = user_id.localpart().to_owned();
	if !services.globals.new_user_displayname_suffix().is_empty() {
		write!(displayname, " {}", services.server.config.new_user_displayname_suffix)?;
	}
	services.users.set_displayname(&user_id, Some(displayname));

	// Initial push rules
	services
		.account_data
		.update(
			None,
			&user_id,
			ruma::events::GlobalAccountDataEventType::PushRules.to_string().into(),
			&serde_json::to_value(PushRulesEvent::new(
				push::Ruleset::server_default(&user_id).into(),
			))
			.expect("should be able to serialize push rules"),
		)
		.await?;

	// First user becomes admin automatically, plus explicit grant if requested
	services.firstrun.empower_first_user(&user_id).await?;
	if body.admin {
		services.admin.make_user_admin(&user_id).await?;
	}

	// Auto-join configured rooms
	for room in &services.server.config.auto_join_rooms {
		let Ok(room_id) = services.rooms.alias.resolve(room).await else {
			continue;
		};
		let _ = services.rooms.membership.join_room(&user_id, &room_id, None, &[]).await;
	}

	// Create a device + access token so the caller can act as this user
	let device_id: OwnedDeviceId = utils::random_string(DEVICE_ID_LENGTH).into();
	let access_token = utils::random_string(TOKEN_LENGTH);

	services
		.users
		.create_device(
			&user_id,
			&device_id,
			&access_token,
			Some("shared-secret registration".to_owned()),
			None,
		)
		.await?;

	info!(
		user_id = %user_id,
		admin = body.admin,
		"User registered via shared-secret"
	);

	Ok(Json(RegisterResponse {
		user_id: user_id.to_string(),
		home_server: server_name.to_string(),
		access_token,
	}))
}
