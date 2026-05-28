pub mod v1 {
	use ruma::{
		OwnedRoomId, OwnedUserId,
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: GET,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/rooms/{room_id}/members",
		}
	}

	#[request]
	pub struct Request {
		#[ruma_api(path)]
		pub room_id: OwnedRoomId,
	}

	#[response]
	pub struct Response {
		pub members: Vec<OwnedUserId>,
		pub total: u64,
	}

	impl Request {
		#[must_use]
		pub fn new(room_id: OwnedRoomId) -> Self { Self { room_id } }
	}

	impl Response {
		#[must_use]
		pub fn new(members: Vec<OwnedUserId>, total: u64) -> Self { Self { members, total } }
	}
}
