pub mod v1 {
	use ruma::{
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: POST,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/registration_tokens/new",
		}
	}

	#[request]
	pub struct Request {
		/// Maximum number of uses before the token expires.
		/// `null` or absent means unlimited.
		#[serde(skip_serializing_if = "Option::is_none")]
		pub uses_allowed: Option<u64>,

		/// Expiry time as epoch milliseconds. `null` or absent means no expiry.
		#[serde(skip_serializing_if = "Option::is_none")]
		pub expiry_time: Option<u64>,

		/// Length of the generated token string. Defaults to 16 if unset.
		#[serde(skip_serializing_if = "Option::is_none")]
		pub length: Option<u64>,
	}

	#[response]
	pub struct Response {
		/// The plaintext registration token.
		pub token: String,

		/// Expiry time as epoch milliseconds, if set.
		#[serde(skip_serializing_if = "Option::is_none")]
		pub expiry_time: Option<u64>,
	}

	impl Request {
		#[must_use]
		pub fn new() -> Self {
			Self {
				uses_allowed: None,
				expiry_time: None,
				length: None,
			}
		}
	}

	impl Response {
		#[must_use]
		pub fn new(token: String, expiry_time: Option<u64>) -> Self {
			Self {
				token,
				expiry_time,
			}
		}
	}
}
