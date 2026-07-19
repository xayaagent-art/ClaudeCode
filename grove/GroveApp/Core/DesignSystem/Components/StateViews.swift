import SwiftUI

/// Empty state with an optional primary and secondary action (PRD 14.7).
struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String
    var primaryActionTitle: String? = nil
    var primaryAction: (() -> Void)? = nil
    var secondaryActionTitle: String? = nil
    var secondaryAction: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: GroveSpacing.md) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundStyle(GroveColor.brand)
                .accessibilityHidden(true)
            VStack(spacing: GroveSpacing.xs) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .multilineTextAlignment(.center)
                Text(message)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let primaryActionTitle, let primaryAction {
                Button(primaryActionTitle, action: primaryAction)
                    .buttonStyle(.borderedProminent)
                    .tint(GroveColor.brand)
            }
            if let secondaryActionTitle, let secondaryAction {
                Button(secondaryActionTitle, action: secondaryAction)
                    .buttonStyle(.bordered)
            }
        }
        .padding(GroveSpacing.xl)
        .frame(maxWidth: .infinity)
    }
}

/// Error state that always offers a way forward.
struct ErrorStateView: View {
    let message: String
    var retryTitle = "Try again"
    let retry: () -> Void

    var body: some View {
        VStack(spacing: GroveSpacing.md) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(retryTitle, action: retry)
                .buttonStyle(.bordered)
        }
        .padding(GroveSpacing.xl)
        .frame(maxWidth: .infinity)
    }
}

struct LoadingStateView: View {
    var label = "Loading"

    var body: some View {
        ProgressView(label)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview("States") {
    ScrollView {
        VStack(spacing: GroveSpacing.xl) {
            EmptyStateView(
                systemImage: "leaf",
                title: "No plants yet",
                message: "Add your first plant to start your garden.",
                primaryActionTitle: "Add a plant",
                primaryAction: {},
                secondaryActionTitle: "Explore a demo garden",
                secondaryAction: {}
            )
            ErrorStateView(message: "Something went wrong while loading.", retry: {})
            LoadingStateView()
                .frame(height: 100)
        }
    }
}
