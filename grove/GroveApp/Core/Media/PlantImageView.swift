import SwiftUI
import UIKit
import GroveKit

/// Loads a plant's cover image from the media store, with a calm placeholder
/// while loading and when no photo exists. Photos are optional everywhere.
struct PlantImageView: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    let assetID: MediaAsset.ID?
    var cornerRadius: CGFloat = GroveRadius.thumbnail

    @State private var image: Image?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Color(uiColor: .systemFill).opacity(0.5))
            if let image {
                image
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: "leaf")
                    .font(.title2)
                    .foregroundStyle(.tertiary)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .task(id: assetID) {
            await load()
        }
    }

    private func load() async {
        guard let assetID else {
            image = nil
            return
        }
        if let cached = ImageMemoryCache.shared.image(for: assetID) {
            image = cached
            return
        }
        guard let data = await appEnvironment.media.imageData(for: assetID),
              let uiImage = UIImage(data: data) else {
            image = nil
            return
        }
        let loaded = Image(uiImage: uiImage)
        ImageMemoryCache.shared.store(loaded, for: assetID)
        image = loaded
    }
}

/// Tiny main-actor image cache so grids don't re-decode JPEGs on every scroll.
@MainActor
final class ImageMemoryCache {
    static let shared = ImageMemoryCache()
    private var storage: [MediaAsset.ID: Image] = [:]

    func image(for id: MediaAsset.ID) -> Image? {
        storage[id]
    }

    func store(_ image: Image, for id: MediaAsset.ID) {
        storage[id] = image
        // Bounded: this cache only ever holds cover images, and a garden of
        // hundreds of plants stays well within memory at thumbnail scale.
        if storage.count > 500 {
            storage.removeAll()
        }
    }
}
