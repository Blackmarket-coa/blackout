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
			1.0 => "/_continuwuity/admin/v1/rooms",
		}
	}

	#[request]
	#[derive(Default)]
	pub struct Request {}

	#[response]
	pub struct Response {
		pub rooms: Vec<OwnedRoomId>,
		pub total_rooms: u64,
	}

	impl Request {
		#[must_use]
		pub fn new() -> Self { Self::default() }
	}

	impl Response {
		#[must_use]
		pub fn new(rooms: Vec<OwnedRoomId>, total_rooms: u64) -> Self { Self { rooms, total_rooms } }
	}
}
