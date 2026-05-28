pub mod v1 {
	use ruma::{
		OwnedRoomId, OwnedUserId,
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: POST,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/join/{room_id}",
		}
	}

	#[request]
	pub struct Request {
		#[ruma_api(path)]
		pub room_id: OwnedRoomId,

		/// The local user to force-join.
		pub user_id: OwnedUserId,
	}

	#[response]
	pub struct Response {
		pub joined: bool,
	}

	impl Request {
		#[must_use]
		pub fn new(room_id: OwnedRoomId, user_id: OwnedUserId) -> Self { Self { room_id, user_id } }
	}

	impl Response {
		#[must_use]
		pub fn new(joined: bool) -> Self { Self { joined } }
	}
}
