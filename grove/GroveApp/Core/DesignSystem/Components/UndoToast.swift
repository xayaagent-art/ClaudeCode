import SwiftUI

/// Short-lived toast offering undo after a consequential quick action
/// (PRD 10.7: every quick log/archive action provides a brief undo window).
struct UndoToast: View {
    let message: String
    let undo: () -> Void

    var body: some View {
        HStack(spacing: GroveSpacing.sm) {
            Text(message)
                .font(.subheadline)
                .lineLimit(2)
            Spacer(minLength: GroveSpacing.sm)
            Button("Undo", action: undo)
                .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, GroveSpacing.md)
        .padding(.vertical, GroveSpacing.sm)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        .shadow(color: .black.opacity(0.1), radius: 8, y: 2)
        .padding(.horizontal, GroveSpacing.screenMargin)
    }
}

/// Presents the garden model's pending undo action above the given content.
struct UndoToastModifier: ViewModifier {
    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let undo = appEnvironment.garden.pendingUndo {
                UndoToast(message: undo.message) {
                    Task { await appEnvironment.garden.undoArchive(undo) }
                }
                .padding(.bottom, GroveSpacing.md)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                .task(id: undo.id) {
                    try? await Task.sleep(for: .seconds(5))
                    if appEnvironment.garden.pendingUndo?.id == undo.id {
                        appEnvironment.garden.pendingUndo = nil
                    }
                }
            }
        }
        .animation(
            GroveMotion.respecting(GroveMotion.springGentle, reduceMotion: reduceMotion),
            value: appEnvironment.garden.pendingUndo
        )
    }
}

extension View {
    func undoToastHost() -> some View {
        modifier(UndoToastModifier())
    }
}
