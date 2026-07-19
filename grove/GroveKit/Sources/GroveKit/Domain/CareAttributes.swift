import Foundation

/// A single care fact about a plant, always paired with where it came from so the
/// UI can distinguish species guidance from user-entered settings (PRD 10.4).
public struct CareAttribute: Hashable, Codable, Sendable {
    public var value: String
    public var source: CareGuidanceSource

    public init(value: String, source: CareGuidanceSource = .userProvided) {
        self.value = value
        self.source = source
    }
}

public enum CareGuidanceSource: String, Codable, Sendable, Hashable {
    case speciesBaseline
    case userProvided
    case learned
}

/// The care snapshot for a plant (PRD 10.4 "Care snapshot"). Every field is optional:
/// missing data must never prevent use ("Progress over perfection").
public struct CareAttributes: Hashable, Codable, Sendable {
    public var water: CareAttribute?
    public var light: CareAttribute?
    public var humidity: CareAttribute?
    public var temperature: CareAttribute?
    public var soil: CareAttribute?
    public var fertilizer: CareAttribute?
    public var toxicity: CareAttribute?
    public var difficulty: CareAttribute?

    public init(
        water: CareAttribute? = nil,
        light: CareAttribute? = nil,
        humidity: CareAttribute? = nil,
        temperature: CareAttribute? = nil,
        soil: CareAttribute? = nil,
        fertilizer: CareAttribute? = nil,
        toxicity: CareAttribute? = nil,
        difficulty: CareAttribute? = nil
    ) {
        self.water = water
        self.light = light
        self.humidity = humidity
        self.temperature = temperature
        self.soil = soil
        self.fertilizer = fertilizer
        self.toxicity = toxicity
        self.difficulty = difficulty
    }

    public var isEmpty: Bool {
        [water, light, humidity, temperature, soil, fertilizer, toxicity, difficulty]
            .allSatisfy { $0 == nil }
    }

    /// Stable, ordered list for rendering the care snapshot.
    public var entries: [(field: CareField, attribute: CareAttribute)] {
        CareField.allCases.compactMap { field in
            self[field].map { (field, $0) }
        }
    }

    public subscript(field: CareField) -> CareAttribute? {
        get {
            switch field {
            case .water: water
            case .light: light
            case .humidity: humidity
            case .temperature: temperature
            case .soil: soil
            case .fertilizer: fertilizer
            case .toxicity: toxicity
            case .difficulty: difficulty
            }
        }
        set {
            switch field {
            case .water: water = newValue
            case .light: light = newValue
            case .humidity: humidity = newValue
            case .temperature: temperature = newValue
            case .soil: soil = newValue
            case .fertilizer: fertilizer = newValue
            case .toxicity: toxicity = newValue
            case .difficulty: difficulty = newValue
            }
        }
    }
}

public enum CareField: String, Codable, Sendable, CaseIterable, Hashable {
    case water
    case light
    case humidity
    case temperature
    case soil
    case fertilizer
    case toxicity
    case difficulty

    public var displayName: String {
        switch self {
        case .water: "Water"
        case .light: "Light"
        case .humidity: "Humidity"
        case .temperature: "Temperature"
        case .soil: "Soil"
        case .fertilizer: "Fertilizer"
        case .toxicity: "Toxicity"
        case .difficulty: "Difficulty"
        }
    }

    /// SF Symbol name used by the app layer.
    public var symbolName: String {
        switch self {
        case .water: "drop"
        case .light: "sun.max"
        case .humidity: "humidity"
        case .temperature: "thermometer.medium"
        case .soil: "square.stack.3d.up"
        case .fertilizer: "leaf.arrow.circlepath"
        case .toxicity: "pawprint"
        case .difficulty: "chart.bar"
        }
    }
}
