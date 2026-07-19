// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GroveKit",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "GroveKit", targets: ["GroveKit"])
    ],
    targets: [
        .target(name: "GroveKit"),
        .testTarget(name: "GroveKitTests", dependencies: ["GroveKit"]),
    ]
)
