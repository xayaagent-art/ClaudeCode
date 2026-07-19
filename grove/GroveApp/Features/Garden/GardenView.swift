import SwiftUI
import GroveKit

/// The garden: photographic grid by default, with list and room views,
/// search across names/rooms/notes, and lightweight filters (PRD 10.3).
struct GardenView: View {
    private enum ViewMode: String, CaseIterable {
        case grid, list, rooms

        var label: (title: String, symbol: String) {
            switch self {
            case .grid: ("Grid", "square.grid.2x2")
            case .list: ("List", "list.bullet")
            case .rooms: ("Rooms", "square.split.2x2")
            }
        }
    }

    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var viewMode: ViewMode = .grid
    @State private var searchText = ""
    @State private var filter: GardenFilter = .active
    @State private var showAddPlant = false
    @State private var showRooms = false

    private var garden: GardenModel { appEnvironment.garden }

    private var query: GardenQuery {
        GardenQuery(searchText: searchText, filter: filter)
    }

    private var results: [Plant] {
        garden.plants(query)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Garden")
                .searchable(text: $searchText, prompt: "Search plants, rooms, notes")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        viewModePicker
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button {
                                showAddPlant = true
                            } label: {
                                Label("Add plant", systemImage: "leaf")
                            }
                            Button {
                                showRooms = true
                            } label: {
                                Label("Manage rooms", systemImage: "square.split.2x2")
                            }
                        } label: {
                            Label("Add", systemImage: "plus")
                        }
                        .accessibilityIdentifier("gardenAddMenu")
                    }
                }
                .navigationDestination(for: Plant.ID.self) { plantID in
                    PlantDetailView(plantID: plantID)
                }
                .sheet(isPresented: $showAddPlant) {
                    PlantFormView(mode: .create)
                }
                .sheet(isPresented: $showRooms) {
                    RoomsView()
                }
        }
        .undoToastHost()
    }

    @ViewBuilder
    private var content: some View {
        if garden.activePlants.isEmpty && searchText.isEmpty && filter == .active {
            gardenEmptyState
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: GroveSpacing.md) {
                    filterChips
                    switch viewMode {
                    case .grid: gridContent
                    case .list: listContent
                    case .rooms: roomsContent
                    }
                }
                .padding(.horizontal, GroveSpacing.screenMargin)
                .padding(.bottom, GroveSpacing.xxl)
            }
        }
    }

    private var viewModePicker: some View {
        Picker("View mode", selection: $viewMode) {
            ForEach(ViewMode.allCases, id: \.self) { mode in
                Label(mode.label.title, systemImage: mode.label.symbol).tag(mode)
            }
        }
        .pickerStyle(.menu)
        .onChange(of: viewMode) {
            GroveHaptics.selection()
        }
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: GroveSpacing.xs) {
                ForEach(GardenFilter.allCases, id: \.self) { candidate in
                    FilterChip(
                        title: candidate.displayName,
                        isSelected: filter == candidate
                    ) {
                        filter = candidate
                        GroveHaptics.selection()
                    }
                }
            }
        }
    }

    // MARK: - Grid

    private let gridColumns = [
        GridItem(.adaptive(minimum: 150, maximum: 220), spacing: GroveSpacing.md)
    ]

    private var gridContent: some View {
        LazyVGrid(columns: gridColumns, spacing: GroveSpacing.md) {
            ForEach(results) { plant in
                NavigationLink(value: plant.id) {
                    PlantCard(
                        plant: plant,
                        roomName: garden.roomName(for: plant),
                        status: garden.status(for: plant).status
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .overlay {
            if results.isEmpty { noResultsState }
        }
    }

    // MARK: - List

    private var listContent: some View {
        LazyVStack(spacing: 0) {
            ForEach(results) { plant in
                NavigationLink(value: plant.id) {
                    PlantListRow(
                        plant: plant,
                        roomName: garden.roomName(for: plant),
                        status: garden.status(for: plant).status
                    )
                    .padding(.vertical, GroveSpacing.xs)
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
        .overlay {
            if results.isEmpty { noResultsState }
        }
    }

    // MARK: - Rooms

    private var roomsContent: some View {
        LazyVStack(alignment: .leading, spacing: GroveSpacing.lg) {
            ForEach(roomSections, id: \.title) { section in
                VStack(alignment: .leading, spacing: GroveSpacing.sm) {
                    Text(section.title)
                        .font(.title3.weight(.semibold))
                    LazyVGrid(columns: gridColumns, spacing: GroveSpacing.md) {
                        ForEach(section.plants) { plant in
                            NavigationLink(value: plant.id) {
                                PlantCard(
                                    plant: plant,
                                    roomName: nil,
                                    status: garden.status(for: plant).status
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            if roomSections.isEmpty { noResultsState }
        }
    }

    private var roomSections: [(title: String, plants: [Plant])] {
        var sections: [(String, [Plant])] = []
        for location in garden.locations {
            let plants = results.filter { $0.locationID == location.id }
            if !plants.isEmpty {
                sections.append((location.name, plants))
            }
        }
        let unassigned = results.filter { plant in
            garden.location(id: plant.locationID) == nil
        }
        if !unassigned.isEmpty {
            sections.append(("No room", unassigned))
        }
        return sections
    }

    // MARK: - Empty states

    private var gardenEmptyState: some View {
        EmptyStateView(
            systemImage: "leaf",
            title: "Your garden is empty",
            message: "Add your first plant to start tracking what it needs.",
            primaryActionTitle: "Add a plant",
            primaryAction: { showAddPlant = true },
            secondaryActionTitle: garden.hasDemoPlants ? nil : "Explore a demo garden",
            secondaryAction: garden.hasDemoPlants ? nil : {
                Task { try? await garden.installDemoGarden() }
            }
        )
        .padding(.top, GroveSpacing.xxl)
    }

    private var noResultsState: some View {
        EmptyStateView(
            systemImage: "magnifyingglass",
            title: "No plants found",
            message: searchText.isEmpty
                ? "Nothing matches this filter yet."
                : "Nothing matches “\(searchText)”. Try a name, room, or note."
        )
        .padding(.top, GroveSpacing.xl)
    }
}

/// Selectable filter chip with clear selected state (PRD 14.7).
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .padding(.horizontal, GroveSpacing.sm)
                .padding(.vertical, GroveSpacing.xs)
                .background(
                    isSelected ? AnyShapeStyle(GroveColor.brand.opacity(0.15)) : AnyShapeStyle(Color(uiColor: .systemFill).opacity(0.5)),
                    in: Capsule()
                )
                .foregroundStyle(isSelected ? GroveColor.brand : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview("Garden") {
    GardenView()
        .environment(AppEnvironment.preview())
}
