pub mod v1 {
	use ruma::{
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: DELETE,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/registration_tokens/{token}",
		}
	}

	#[request]
	pub struct Request {
		/// The registration token to revoke.
		#[ruma_api(path)]
		pub token: String,
	}

	#[response]
	pub struct Response {}

	impl Request {
		#[must_use]
		pub fn new(token: String) -> Self { Self { token } }
	}

	impl Response {
		#[must_use]
		pub fn new() -> Self { Self {} }
	}
}
