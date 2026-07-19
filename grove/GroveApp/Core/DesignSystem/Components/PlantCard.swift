import SwiftUI
import GroveKit

/// Garden grid card: photograph-led, restrained metadata (PRD 10.3).
struct PlantCard: View {
    let plant: Plant
    let roomName: String?
    let status: PlantStatus

    var body: some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            PlantImageView(assetID: plant.coverAssetID, cornerRadius: GroveRadius.card)
                .aspectRatio(1, contentMode: .fit)
                .overlay(alignment: .topLeading) {
                    StatusPill(status: status)
                        .padding(GroveSpacing.xs)
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(plant.displayName)
                    .font(.headline)
                    .lineLimit(1)
                if let roomName {
                    Text(roomName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, GroveSpacing.xxs)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        var parts = [plant.displayName]
        if let roomName { parts.append(roomName) }
        parts.append("Status: \(status.displayName)")
        return parts.joined(separator: ", ")
    }
}

/// Garden compact list row.
struct PlantListRow: View {
    let plant: Plant
    let roomName: String?
    let status: PlantStatus

    var body: some View {
        HStack(spacing: GroveSpacing.sm) {
            PlantImageView(assetID: plant.coverAssetID)
                .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text(plant.displayName)
                    .font(.headline)
                    .lineLimit(1)
                HStack(spacing: GroveSpacing.xs) {
                    if let secondary = plant.secondaryName {
                        Text(secondary)
                            .lineLimit(1)
                    }
                    if let roomName {
                        if plant.secondaryName != nil {
                            Text("·")
                        }
                        Text(roomName)
                            .lineLimit(1)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            Spacer()
            StatusPill(status: status)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        var parts = [plant.displayName]
        if let roomName { parts.append(roomName) }
        parts.append("Status: \(status.displayName)")
        return parts.joined(separator: ", ")
    }
}

#Preview("Plant cards") {
    let environment = AppEnvironment.preview()
    return ScrollView {
        VStack(spacing: GroveSpacing.md) {
            HStack(spacing: GroveSpacing.md) {
                PlantCard(
                    plant: Plant(
                        nickname: "Frank",
                        commonName: "Rubber Plant",
                        createdAt: .now,
                        updatedAt: .now
                    ),
                    roomName: "Living room",
                    status: .doingWell
                )
                PlantCard(
                    plant: Plant(commonName: "Monstera", createdAt: .now, updatedAt: .now),
                    roomName: nil,
                    status: .unknown
                )
            }
            PlantListRow(
                plant: Plant(
                    nickname: "Sunny",
                    commonName: "Golden Pothos",
                    createdAt: .now,
                    updatedAt: .now
                ),
                roomName: "Bedroom",
                status: .doingWell
            )
        }
        .padding()
    }
    .environment(environment)
}
