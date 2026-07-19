import SwiftUI
import GroveKit

/// Compact status indicator. Always pairs color with an icon and text so color
/// is never the only signal (PRD 14.5, Differentiate Without Color).
struct StatusPill: View {
    let status: PlantStatus

    var body: some View {
        Label(status.displayName, systemImage: GroveColor.statusSymbol(status))
            .font(.caption.weight(.medium))
            .foregroundStyle(GroveColor.statusTint(status))
            .padding(.horizontal, GroveSpacing.xs)
            .padding(.vertical, GroveSpacing.xxs)
            .background(.thinMaterial, in: Capsule())
            .accessibilityLabel("Status: \(status.displayName)")
    }
}

#Preview("Status pills", traits: .sizeThatFitsLayout) {
    VStack(alignment: .leading, spacing: GroveSpacing.xs) {
        ForEach(PlantStatus.allCases, id: \.self) { status in
            StatusPill(status: status)
        }
    }
    .padding()
}
