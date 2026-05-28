pub mod v1 {
	use ruma::{
		OwnedRoomId,
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: GET,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/rooms/{room_id}/state",
		}
	}

	#[request]
	pub struct Request {
		#[ruma_api(path)]
		pub room_id: OwnedRoomId,
	}

	#[response]
	pub struct Response {
		/// Raw state events — each has `type`, `state_key`, `content`.
		pub state: Vec<serde_json::Value>,
	}

	impl Request {
		#[must_use]
		pub fn new(room_id: OwnedRoomId) -> Self { Self { room_id } }
	}

	impl Response {
		#[must_use]
		pub fn new(state: Vec<serde_json::Value>) -> Self { Self { state } }
	}
}
