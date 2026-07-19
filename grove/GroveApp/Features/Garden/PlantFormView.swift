import SwiftUI
import UIKit
import PhotosUI
import GroveKit

/// Shared form for creating and editing a plant. Only a name is required;
/// everything else is progressive detail (Milestone 1 acceptance criteria).
struct PlantFormView: View {
    enum Mode {
        case create
        case edit(Plant)
    }

    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.dismiss) private var dismiss

    let mode: Mode
    var preselectedRoom: PlantLocation.ID? = nil
    var onSaved: (() -> Void)? = nil

    @State private var nickname = ""
    @State private var commonName = ""
    @State private var scientificName = ""
    @State private var locationID: PlantLocation.ID?
    @State private var hasAcquisitionDate = false
    @State private var acquisitionDate = Date()
    @State private var acquisitionSource = ""
    @State private var notes = ""
    @State private var care = CareAttributes()

    @State private var photoItem: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var existingCoverAssetID: MediaAsset.ID?

    @State private var showNewRoom = false
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var hasPopulated = false

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var hasAnyName: Bool {
        ![nickname, commonName, scientificName]
            .allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $nickname)
                        .accessibilityIdentifier("plantNameField")
                    TextField("Common name (optional)", text: $commonName)
                    TextField("Scientific name (optional)", text: $scientificName)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Identity")
                } footer: {
                    if !hasAnyName {
                        Text("Give your plant any name to save it. Species details can come later.")
                    }
                }

                Section("Photo") {
                    HStack(spacing: GroveSpacing.md) {
                        photoPreview
                            .frame(width: 72, height: 72)
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Text(photoData == nil && existingCoverAssetID == nil
                                 ? "Choose photo"
                                 : "Change photo")
                        }
                        if photoData != nil {
                            Button("Remove", role: .destructive) {
                                photoData = nil
                                photoItem = nil
                            }
                        }
                    }
                }

                Section("Room") {
                    Picker("Room", selection: $locationID) {
                        Text("None").tag(PlantLocation.ID?.none)
                        ForEach(appEnvironment.garden.locations) { location in
                            Text(location.name).tag(Optional(location.id))
                        }
                    }
                    Button("New room…") { showNewRoom = true }
                }

                Section("Care details (optional)") {
                    ForEach(CareField.allCases, id: \.self) { field in
                        careField(field)
                    }
                }

                Section("History (optional)") {
                    Toggle("Acquisition date", isOn: $hasAcquisitionDate.animation())
                    if hasAcquisitionDate {
                        DatePicker(
                            "Acquired",
                            selection: $acquisitionDate,
                            in: ...Date(),
                            displayedComponents: .date
                        )
                    }
                    TextField("Where it came from", text: $acquisitionSource)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle(isEditing ? "Edit plant" : "Add plant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!hasAnyName || isSaving)
                        .accessibilityIdentifier("savePlantButton")
                }
            }
            .interactiveDismissDisabled(isSaving)
            .onAppear(perform: populateFromMode)
            .onChange(of: photoItem) {
                loadSelectedPhoto()
            }
            .sheet(isPresented: $showNewRoom) {
                NewRoomSheet { newLocation in
                    locationID = newLocation.id
                }
            }
            .alert("Could not save", isPresented: .init(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveError ?? "")
            }
        }
    }

    @ViewBuilder
    private var photoPreview: some View {
        if let photoData, let uiImage = UIImage(data: photoData) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: GroveRadius.thumbnail, style: .continuous))
                .accessibilityLabel("Selected plant photo")
        } else {
            PlantImageView(assetID: existingCoverAssetID)
                .frame(width: 72, height: 72)
                .accessibilityLabel(existingCoverAssetID == nil ? "No photo selected" : "Current plant photo")
        }
    }

    private func careField(_ field: CareField) -> some View {
        TextField(
            field.displayName,
            text: .init(
                get: { care[field]?.value ?? "" },
                set: { newValue in
                    let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                    care[field] = trimmed.isEmpty
                        ? nil
                        : CareAttribute(value: newValue, source: .userProvided)
                }
            ),
            axis: .vertical
        )
    }

    private func populateFromMode() {
        guard !hasPopulated else { return }
        hasPopulated = true
        guard case .edit(let plant) = mode else {
            locationID = preselectedRoom
            return
        }
        nickname = plant.nickname ?? ""
        commonName = plant.commonName ?? ""
        scientificName = plant.scientificName ?? ""
        locationID = plant.locationID
        hasAcquisitionDate = plant.acquisitionDate != nil
        acquisitionDate = plant.acquisitionDate ?? Date()
        acquisitionSource = plant.acquisitionSource ?? ""
        notes = plant.notes
        care = plant.care
        existingCoverAssetID = plant.coverAssetID
    }

    private func loadSelectedPhoto() {
        guard let photoItem else { return }
        Task {
            guard let data = try? await photoItem.loadTransferable(type: Data.self) else { return }
            photoData = ImageProcessing.downscaledJPEG(from: data)
        }
    }

    private func save() {
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                switch mode {
                case .create:
                    let draft = PlantDraft(
                        nickname: nickname,
                        commonName: commonName,
                        scientificName: scientificName,
                        locationID: locationID,
                        acquisitionDate: hasAcquisitionDate ? acquisitionDate : nil,
                        acquisitionSource: acquisitionSource,
                        notes: notes,
                        care: care
                    )
                    _ = try await appEnvironment.garden.addPlant(draft, imageData: photoData)
                case .edit(let original):
                    var updated = original
                    updated.nickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
                    updated.commonName = commonName.trimmingCharacters(in: .whitespacesAndNewlines)
                    updated.scientificName = scientificName.trimmingCharacters(in: .whitespacesAndNewlines)
                    updated.locationID = locationID
                    updated.acquisitionDate = hasAcquisitionDate ? acquisitionDate : nil
                    updated.acquisitionSource = acquisitionSource
                    updated.notes = notes
                    updated.care = care
                    _ = try await appEnvironment.garden.updatePlant(updated, newImageData: photoData)
                }
                GroveHaptics.lightImpact()
                dismiss()
                onSaved?()
            } catch GardenError.nameRequired {
                saveError = "Give your plant a name before saving."
            } catch {
                saveError = "Your plant could not be saved. Please try again."
            }
        }
    }
}

/// Minimal image handling for Milestone 1: bounded dimensions, JPEG storage.
enum ImageProcessing {
    static func downscaledJPEG(from data: Data, maxDimension: CGFloat = 2048) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let largestSide = max(image.size.width, image.size.height)
        guard largestSide > maxDimension else {
            return image.jpegData(compressionQuality: 0.85)
        }
        let scale = maxDimension / largestSide
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
        return resized.jpegData(compressionQuality: 0.85)
    }
}

#Preview("Add plant") {
    PlantFormView(mode: .create)
        .environment(AppEnvironment.preview())
}
