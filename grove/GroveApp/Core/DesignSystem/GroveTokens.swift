import SwiftUI
import GroveKit
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Spacing (4-point base system, PRD 14.3)

enum GroveSpacing {
    /// 4
    static let xxs: CGFloat = 4
    /// 8
    static let xs: CGFloat = 8
    /// 12
    static let sm: CGFloat = 12
    /// 16
    static let md: CGFloat = 16
    /// 20
    static let lg: CGFloat = 20
    /// 24
    static let xl: CGFloat = 24
    /// 32
    static let xxl: CGFloat = 32
    /// Default horizontal content margin.
    static let screenMargin: CGFloat = 16
}

enum GroveRadius {
    static let card: CGFloat = 16
    static let thumbnail: CGFloat = 12
    static let chip: CGFloat = 20
}

// MARK: - Color (semantic system colors as the base, PRD 14.5)

enum GroveColor {
    /// Restrained botanical brand tone, adapted for light and dark appearance.
    static let brand = Color(
        light: Color(red: 0.18, green: 0.42, blue: 0.31),
        dark: Color(red: 0.45, green: 0.72, blue: 0.58)
    )

    static func statusTint(_ status: PlantStatus) -> Color {
        switch status {
        case .doingWell, .recovering: .green
        case .reviewDue: .orange
        case .needsAttention: .orange
        case .dormant, .unknown: .secondary
        }
    }

    static func statusSymbol(_ status: PlantStatus) -> String {
        switch status {
        case .doingWell: "checkmark.circle"
        case .recovering: "arrow.up.heart"
        case .reviewDue: "clock"
        case .needsAttention: "exclamationmark.circle"
        case .dormant: "moon.zzz"
        case .unknown: "sparkle.magnifyingglass"
        }
    }
}

private extension Color {
    init(light: Color, dark: Color) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #else
        self = light
        #endif
    }
}

extension Color {
    /// `Color.secondary` is a ShapeStyle, not always usable as a tint; this is
    /// the concrete secondary label color for places that need a `Color`.
    static var secondaryLabel: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondaryLabel)
        #else
        .secondary
        #endif
    }
}

// MARK: - Motion tokens (PRD 14.8)

enum GroveMotion {
    static let immediate: Animation = .easeOut(duration: 0.12)
    static let quick: Animation = .easeOut(duration: 0.2)
    static let standard: Animation = .easeInOut(duration: 0.3)
    static let emphasis: Animation = .easeInOut(duration: 0.45)
    static let springResponsive: Animation = .spring(response: 0.35, dampingFraction: 0.85)
    static let springGentle: Animation = .spring(response: 0.5, dampingFraction: 0.9)
    static let springCelebratory: Animation = .spring(response: 0.45, dampingFraction: 0.7)

    /// Honors Reduce Motion: returns nil (no animation) when the token would
    /// otherwise move content around.
    static func respecting(_ token: Animation, reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : token
    }
}

// MARK: - Haptics (PRD 14.9 — sparing, meaningful only)

@MainActor
enum GroveHaptics {
    static func selection() {
        #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }

    static func lightImpact() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }

    static func success() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
    }

    static func warning() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        #endif
    }
}
