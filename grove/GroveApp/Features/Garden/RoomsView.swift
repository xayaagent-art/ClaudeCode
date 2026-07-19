import SwiftUI
import GroveKit

/// Manage rooms and locations: create, rename, archive. Archiving a room
/// never deletes plants — they become unassigned.
struct RoomsView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.dismiss) private var dismiss

    @State private var showNewRoom = false
    @State private var roomPendingArchive: PlantLocation?
    @State private var renamingRoom: PlantLocation?
    @State private var renameText = ""
    @State private var errorMessage: String?

    private var garden: GardenModel { appEnvironment.garden }

    var body: some View {
        NavigationStack {
            Group {
                if garden.locations.isEmpty {
                    EmptyStateView(
                        systemImage: "square.split.2x2",
                        title: "No rooms yet",
                        message: "Rooms group your plants by where they live — bedroom, balcony, greenhouse.",
                        primaryActionTitle: "Add a room",
                        primaryAction: { showNewRoom = true }
                    )
                } else {
                    List {
                        ForEach(garden.locations) { location in
                            row(for: location)
                        }
                    }
                }
            }
            .navigationTitle("Rooms")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showNewRoom = true
                    } label: {
                        Label("Add room", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showNewRoom) {
                NewRoomSheet(onCreated: nil)
            }
            .alert(
                "Rename room",
                isPresented: .init(
                    get: { renamingRoom != nil },
                    set: { if !$0 { renamingRoom = nil } }
                )
            ) {
                TextField("Room name", text: $renameText)
                Button("Save") { commitRename() }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog(
                "Remove “\(roomPendingArchive?.name ?? "")”?",
                isPresented: .init(
                    get: { roomPendingArchive != nil },
                    set: { if !$0 { roomPendingArchive = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Remove room", role: .destructive) { commitArchive() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Plants in this room are kept and become unassigned.")
            }
            .alert("Something went wrong", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func row(for location: PlantLocation) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(location.name)
                    .font(.body)
                HStack(spacing: GroveSpacing.xs) {
                    Text(location.type.displayName)
                    if let light = location.defaultLightLevel {
                        Text("·")
                        Text(light.displayName)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(garden.plantCount(in: location.id))")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
                .accessibilityLabel("\(garden.plantCount(in: location.id)) plants")
        }
        .swipeActions(edge: .trailing) {
            Button("Remove", role: .destructive) {
                roomPendingArchive = location
            }
            Button("Rename") {
                renameText = location.name
                renamingRoom = location
            }
        }
        .contextMenu {
            Button {
                renameText = location.name
                renamingRoom = location
            } label: {
                Label("Rename", systemImage: "pencil")
            }
            Button(role: .destructive) {
                roomPendingArchive = location
            } label: {
                Label("Remove", systemImage: "trash")
            }
        }
    }

    private func commitRename() {
        guard var room = renamingRoom else { return }
        room.name = renameText
        renamingRoom = nil
        Task {
            do {
                try await garden.updateLocation(room)
            } catch {
                errorMessage = "The room could not be renamed. Room names cannot be empty."
            }
        }
    }

    private func commitArchive() {
        guard let room = roomPendingArchive else { return }
        roomPendingArchive = nil
        Task {
            do {
                try await garden.archiveLocation(room)
            } catch {
                errorMessage = "The room could not be removed. Please try again."
            }
        }
    }
}

/// Small sheet for creating a room, reused from the plant form.
struct NewRoomSheet: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.dismiss) private var dismiss

    var onCreated: ((PlantLocation) -> Void)? = nil

    @State private var name = ""
    @State private var type: LocationType = .room
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Room name", text: $name)
                Picker("Type", selection: $type) {
                    ForEach(LocationType.allCases, id: \.self) { type in
                        Text(type.displayName).tag(type)
                    }
                }
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle("New room")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { create() }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func create() {
        Task {
            do {
                let location = try await appEnvironment.garden.addLocation(name: name, type: type)
                dismiss()
                onCreated?(location)
            } catch GardenError.duplicateLocationName {
                errorMessage = "You already have a room with this name."
            } catch {
                errorMessage = "The room could not be created. Please try again."
            }
        }
    }
}

#Preview("Rooms") {
    RoomsView()
        .environment(AppEnvironment.preview())
}
