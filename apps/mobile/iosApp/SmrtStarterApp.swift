import SwiftUI

@main
struct SmrtStarterApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

struct ContentView: View {
  private let baseUrl = "http://localhost:5173"

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("SMRT Starter")
        .font(.title)
      Text("Tenant-aware subscriptions, usage, and agent tools.")
        .font(.body)
      Text("OIDC PKCE login starts at \(baseUrl)/api/mobile/auth/start")
        .font(.callout)
      Text("Session bootstrap uses \(baseUrl)/api/mobile/session with an Authorization bearer token.")
        .font(.callout)
    }
    .padding()
  }
}
