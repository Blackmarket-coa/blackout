pub mod v1 {
	use ruma::{
		OwnedUserId,
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: POST,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/deactivate/{user_id}",
		}
	}

	#[request]
	pub struct Request {
		/// The full Matrix user ID to deactivate.
		#[ruma_api(path)]
		pub user_id: OwnedUserId,

		/// If true, also force the user to leave all joined rooms
		/// (GDPR-style erasure).
		#[serde(default)]
		pub erase: bool,
	}

	#[response]
	pub struct Response {
		pub deactivated: bool,
	}

	impl Request {
		#[must_use]
		pub fn new(user_id: OwnedUserId, erase: bool) -> Self { Self { user_id, erase } }
	}

	impl Response {
		#[must_use]
		pub fn new(deactivated: bool) -> Self { Self { deactivated } }
	}
}
