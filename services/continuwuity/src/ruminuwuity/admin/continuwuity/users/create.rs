pub mod v1 {
	use ruma::{
		OwnedUserId,
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: PUT,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/users/{user_id}",
		}
	}

	#[request]
	pub struct Request {
		/// The full Matrix user ID (e.g. `@bob:blackout.local`).
		#[ruma_api(path)]
		pub user_id: OwnedUserId,

		/// The password for the new account. If not provided, a random
		/// 25-character password is generated and returned.
		#[serde(skip_serializing_if = "Option::is_none")]
		pub password: Option<String>,

		/// Optional display name.
		#[serde(skip_serializing_if = "Option::is_none")]
		pub displayname: Option<String>,
	}

	#[response]
	pub struct Response {
		/// The created user's full MXID.
		pub user_id: OwnedUserId,

		/// The server name.
		pub home_server: String,

		/// The password (echoed back, or auto-generated if not provided).
		pub password: String,
	}

	impl Request {
		#[must_use]
		pub fn new(user_id: OwnedUserId, password: Option<String>, displayname: Option<String>) -> Self {
			Self {
				user_id,
				password,
				displayname,
			}
		}
	}

	impl Response {
		#[must_use]
		pub fn new(user_id: OwnedUserId, home_server: String, password: String) -> Self {
			Self {
				user_id,
				home_server,
				password,
			}
		}
	}
}
