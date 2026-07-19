import Foundation

/// The explorable demo garden offered on first run (PRD 10.1) and reused as
/// preview data so every screen can be reviewed without a live backend.
public enum DemoGarden {
    public struct Contents: Sendable {
        public let newLocations: [PlantLocation]
        public let plants: [Plant]
    }

    /// Builds demo content. Reuses locations that already exist by name so the
    /// demo never creates a second "Living room".
    public static func make(asOf now: Date, existingLocations: [PlantLocation]) -> Contents {
        var locationsByName: [String: PlantLocation] = [:]
        for location in existingLocations where location.archivedAt == nil {
            locationsByName[location.name] = location
        }

        var newLocations: [PlantLocation] = []
        var nextSortOrder = (existingLocations.map(\.sortOrder).max() ?? -1) + 1

        func location(_ name: String, type: LocationType, light: LightLevel) -> PlantLocation.ID {
            if let existing = locationsByName[name] {
                return existing.id
            }
            let created = PlantLocation(
                name: name,
                type: type,
                defaultLightLevel: light,
                sortOrder: nextSortOrder,
                isDemo: true
            )
            nextSortOrder += 1
            locationsByName[name] = created
            newLocations.append(created)
            return created.id
        }

        let livingRoom = location("Living room", type: .room, light: .brightIndirect)
        let bedroom = location("Bedroom", type: .room, light: .medium)
        let balcony = location("Balcony", type: .balcony, light: .direct)

        func demoPlant(
            nickname: String?,
            commonName: String,
            scientificName: String,
            location: PlantLocation.ID,
            daysAgo: Int,
            care: CareAttributes,
            notes: String = ""
        ) -> Plant {
            let created = now.addingTimeInterval(-TimeInterval(daysAgo) * 86_400)
            return Plant(
                nickname: nickname,
                commonName: commonName,
                scientificName: scientificName,
                identification: .userProvided,
                origin: .demo,
                locationID: location,
                notes: notes,
                care: care,
                createdAt: created,
                updatedAt: created
            )
        }

        func baseline(
            water: String, light: String, humidity: String? = nil,
            soil: String? = nil, toxicity: String? = nil, difficulty: String? = nil
        ) -> CareAttributes {
            CareAttributes(
                water: CareAttribute(value: water, source: .speciesBaseline),
                light: CareAttribute(value: light, source: .speciesBaseline),
                humidity: humidity.map { CareAttribute(value: $0, source: .speciesBaseline) },
                soil: soil.map { CareAttribute(value: $0, source: .speciesBaseline) },
                toxicity: toxicity.map { CareAttribute(value: $0, source: .speciesBaseline) },
                difficulty: difficulty.map { CareAttribute(value: $0, source: .speciesBaseline) }
            )
        }

        let plants = [
            demoPlant(
                nickname: "Frank",
                commonName: "Rubber Plant",
                scientificName: "Ficus elastica",
                location: livingRoom,
                daysAgo: 240,
                care: baseline(
                    water: "Let the top half of the soil dry between waterings",
                    light: "Bright indirect light",
                    soil: "Well-draining aroid mix",
                    toxicity: "Mildly toxic to pets if chewed",
                    difficulty: "Easy"
                ),
                notes: "Came from the corner nursery. Leans toward the window; rotate now and then."
            ),
            demoPlant(
                nickname: nil,
                commonName: "Monstera",
                scientificName: "Monstera deliciosa",
                location: livingRoom,
                daysAgo: 400,
                care: baseline(
                    water: "Water when the top few centimeters are dry",
                    light: "Bright indirect light",
                    humidity: "Average room humidity is fine",
                    toxicity: "Toxic to cats and dogs if eaten",
                    difficulty: "Easy"
                ),
                notes: "Newest leaf has the first real fenestration."
            ),
            demoPlant(
                nickname: "Sunny",
                commonName: "Golden Pothos",
                scientificName: "Epipremnum aureum",
                location: bedroom,
                daysAgo: 180,
                care: baseline(
                    water: "Tolerates drying out; water when leaves soften slightly",
                    light: "Low to bright indirect light",
                    difficulty: "Very easy"
                )
            ),
            demoPlant(
                nickname: nil,
                commonName: "Snake Plant",
                scientificName: "Dracaena trifasciata",
                location: bedroom,
                daysAgo: 500,
                care: baseline(
                    water: "Water sparingly; let soil dry fully",
                    light: "Tolerates low light",
                    soil: "Gritty, fast-draining mix",
                    difficulty: "Very easy"
                )
            ),
            demoPlant(
                nickname: "Fernie",
                commonName: "Boston Fern",
                scientificName: "Nephrolepis exaltata",
                location: bedroom,
                daysAgo: 60,
                care: baseline(
                    water: "Keep evenly moist, never soggy",
                    light: "Medium indirect light",
                    humidity: "Prefers higher humidity",
                    difficulty: "Moderate"
                )
            ),
            demoPlant(
                nickname: nil,
                commonName: "Fiddle-Leaf Fig",
                scientificName: "Ficus lyrata",
                location: livingRoom,
                daysAgo: 320,
                care: baseline(
                    water: "Water when the top few centimeters are dry",
                    light: "Bright light near a window",
                    toxicity: "Mildly toxic to pets if chewed",
                    difficulty: "Moderate"
                ),
                notes: "Dropped two leaves after the move; has been stable since."
            ),
            demoPlant(
                nickname: "Rosie",
                commonName: "Rosemary",
                scientificName: "Salvia rosmarinus",
                location: balcony,
                daysAgo: 90,
                care: baseline(
                    water: "Let soil dry between waterings",
                    light: "Full sun",
                    soil: "Sandy, well-draining mix",
                    difficulty: "Moderate"
                )
            ),
            demoPlant(
                nickname: nil,
                commonName: "String of Pearls",
                scientificName: "Curio rowleyanus",
                location: balcony,
                daysAgo: 30,
                care: baseline(
                    water: "Water lightly when pearls start to wrinkle",
                    light: "Bright light with some direct morning sun",
                    toxicity: "Toxic to pets if eaten",
                    difficulty: "Tricky"
                )
            ),
        ]

        return Contents(newLocations: newLocations, plants: plants)
    }
}
