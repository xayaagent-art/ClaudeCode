import SwiftUI
import UserNotifications
import GroveKit

/// Create or edit a repeating care review (PRD 10.6). On the first schedule,
/// Grove explains notifications before invoking the system prompt — and a
/// declined prompt changes nothing in the app.
struct ScheduleSheet: View {
    enum Mode {
        case create(Plant.ID)
        case edit(CareSchedule)
    }

    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.dismiss) private var dismiss

    let mode: Mode

    @State private var kind: CareTaskKind = .checkSoil
    @State private var customTitle = ""
    @State private var intervalDays = 7
    @State private var hasPopulated = false
    @State private var offerNotifications = false
    @State private var errorMessage: String?

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Review type", selection: $kind) {
                        ForEach(CareTaskKind.allCases, id: \.self) { kind in
                            Label(kind.displayName, systemImage: kind.symbolName).tag(kind)
                        }
                    }
                    .disabled(isEditing)
                    if kind == .custom {
                        TextField("Task name", text: $customTitle)
                    }
                    Stepper(value: $intervalDays, in: 1...365) {
                        Text("Every \(intervalDays) day\(intervalDays == 1 ? "" : "s")")
                    }
                } footer: {
                    Text("Grove schedules a review window, not a command — a due review asks you to look, it never assumes the plant is suffering.")
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle(isEditing ? "Edit review" : "New review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Add") { save() }
                        .disabled(kind == .custom && customTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear(perform: populate)
            .alert("Get reminded when reviews are due?", isPresented: $offerNotifications) {
                Button("Enable notifications") {
                    Task {
                        _ = await appEnvironment.notifications.requestAuthorization()
                        dismiss()
                    }
                }
                Button("Not now", role: .cancel) { dismiss() }
            } message: {
                Text("Grove can send a quiet reminder on the day a review is due. You can change this anytime in Settings.")
            }
        }
        .presentationDetents([.medium])
    }

    private func populate() {
        guard !hasPopulated else { return }
        hasPopulated = true
        if case .edit(let schedule) = mode {
            kind = schedule.kind
            customTitle = schedule.customTitle ?? ""
            intervalDays = schedule.intervalDays
        }
    }

    private func save() {
        Task {
            do {
                switch mode {
                case .create(let plantID):
                    _ = try await appEnvironment.garden.addSchedule(
                        plantID: plantID,
                        kind: kind,
                        intervalDays: intervalDays,
                        customTitle: kind == .custom ? customTitle : nil
                    )
                    appEnvironment.analytics.track(.careScheduleCreated)
                    // Offer notifications only at the natural moment: the user
                    // just asked to be reminded of something (PRD 22).
                    let status = await appEnvironment.notifications.authorizationStatus()
                    if status == .notDetermined {
                        offerNotifications = true
                    } else {
                        dismiss()
                    }
                case .edit(let original):
                    var updated = original
                    updated.intervalDays = intervalDays
                    updated.customTitle = kind == .custom ? customTitle : nil
                    try await appEnvironment.garden.updateSchedule(updated)
                    dismiss()
                }
            } catch {
                errorMessage = "The review could not be saved. Please try again."
            }
        }
    }
}
