pub mod v1 {
	use ruma::{
		OwnedRoomId,
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: DELETE,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v2/rooms/{room_id}",
		}
	}

	#[request]
	pub struct Request {
		#[ruma_api(path)]
		pub room_id: OwnedRoomId,

		/// Whether to block the room from being re-joined/re-created
		/// after purging.
		#[serde(default)]
		pub block: bool,
	}

	#[response]
	pub struct Response {
		/// UUID tracking the background purge job.
		pub delete_id: String,
	}

	impl Request {
		#[must_use]
		pub fn new(room_id: OwnedRoomId) -> Self { Self { room_id, block: false } }
	}

	impl Response {
		#[must_use]
		pub fn new(delete_id: String) -> Self { Self { delete_id } }
	}
}
