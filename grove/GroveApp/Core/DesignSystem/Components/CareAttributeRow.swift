import SwiftUI
import GroveKit

/// One row of the care snapshot. Shows the guidance and, crucially, where it
/// came from — species baseline, the user, or a learned pattern (PRD 10.4).
struct CareAttributeRow: View {
    let field: CareField
    let attribute: CareAttribute

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: GroveSpacing.sm) {
            Image(systemName: field.symbolName)
                .foregroundStyle(GroveColor.brand)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: GroveSpacing.xs) {
                    Text(field.displayName)
                        .font(.subheadline.weight(.medium))
                    Text(sourceLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, GroveSpacing.xxs + 2)
                        .padding(.vertical, 2)
                        .background(Color(uiColor: .systemFill).opacity(0.6), in: Capsule())
                }
                Text(attribute.value)
                    .font(.body)
                    .foregroundStyle(.primary)
            }
        }
        .padding(.vertical, GroveSpacing.xxs)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(field.displayName): \(attribute.value). Source: \(sourceLabel)")
    }

    private var sourceLabel: String {
        switch attribute.source {
        case .speciesBaseline: "Species guidance"
        case .userProvided: "Your setting"
        case .learned: "Learned"
        }
    }
}

#Preview("Care attribute rows", traits: .sizeThatFitsLayout) {
    List {
        CareAttributeRow(
            field: .water,
            attribute: CareAttribute(value: "Let the top half of the soil dry out", source: .speciesBaseline)
        )
        CareAttributeRow(
            field: .light,
            attribute: CareAttribute(value: "Bright indirect, near the east window", source: .userProvided)
        )
    }
}
