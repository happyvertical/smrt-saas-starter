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
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("SMRT Starter")
        .font(.title)
      Text("Tenant-aware subscriptions, usage, and agent tools.")
        .font(.body)
    }
    .padding()
  }
}
