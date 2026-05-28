pub mod v1 {
	use ruma::{
		api::{auth_scheme::AccessToken, request, response},
		metadata,
	};

	metadata! {
		method: GET,
		rate_limited: false,
		authentication: AccessToken,
		history: {
			1.0 => "/_continuwuity/admin/v1/users",
		}
	}

	/// User record returned by the list endpoint.
	#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
	pub struct UserInfo {
		pub user_id: String,
		pub displayname: Option<String>,
		pub deactivated: bool,
		pub admin: bool,
	}

	#[request]
	#[derive(Default)]
	pub struct Request {
		/// Optional search term (substring match against user ID).
		#[ruma_api(query)]
		#[serde(skip_serializing_if = "Option::is_none")]
		pub search: Option<String>,

		/// Maximum number of results to return (default 50).
		#[ruma_api(query)]
		#[serde(skip_serializing_if = "Option::is_none")]
		pub limit: Option<u64>,
	}

	#[response]
	pub struct Response {
		pub users: Vec<UserInfo>,
		pub total: u64,
	}

	impl Request {
		#[must_use]
		pub fn new() -> Self { Self::default() }
	}

	impl Response {
		#[must_use]
		pub fn new(users: Vec<UserInfo>, total: u64) -> Self { Self { users, total } }
	}
}
