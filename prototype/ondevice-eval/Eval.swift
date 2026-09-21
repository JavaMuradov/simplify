/**
 * Runs Simplify's real system prompt through Apple's on-device model and
 * records what came back, so the on-device thesis can be judged on evidence
 * rather than hope. Deliberately mirrors the extension's runtime shape:
 * the same prompt text, the same batching, the same JSON block contract.
 *
 * Builds with Command Line Tools alone -- no Xcode, no developer account.
 * Schemas are built with DynamicGenerationSchema rather than the @Generable
 * macro because the macro plugin ships only inside Xcode.
 */
import Foundation
import FoundationModels
import NaturalLanguage

struct Fixture: Codable {
    let id: String
    let lang: String
    let text: String
    let facts: [String]
    let negations: [String]
    let qualifiers: [String]
}

struct FixtureFile: Codable {
    let blocks: [Fixture]
}

struct OutBlock: Codable {
    let i: Int
    let t: String
}

struct Result: Codable {
    let id: String
    /// Non-empty when the framework refused the block outright, which is a
    /// different and more final failure than the model answering badly.
    var refused: String = ""
    let declaredLang: String
    let detectedIn: String
    let detectedOut: String
    let original: String
    let simplified: String
    let facts: [String]
    let negations: [String]
    let qualifiers: [String]
}

struct Report: Codable {
    let level: String
    let model: String
    let secondsElapsed: Double
    let results: [Result]
}

/// Mirrors detect() in src/background.js: same 40-character floor and 0.70
/// confidence bar, so the eval judges language drift the way the extension does.
/// This is also the exact replacement for chrome.i18n.detectLanguage, which
/// Safari does not implement.
func detect(_ text: String) -> String {
    guard text.count >= 40 else { return "" }
    let r = NLLanguageRecognizer()
    r.processString(text)
    guard let top = r.languageHypotheses(withMaximum: 1).max(by: { $0.value < $1.value }),
          top.value >= 0.70 else { return "" }
    return String(top.key.rawValue.split(separator: "-")[0])
}

func arg(_ name: String, default def: String) -> String {
    let a = CommandLine.arguments
    guard let i = a.firstIndex(of: "--\(name)"), i + 1 < a.count else { return def }
    return a[i + 1]
}

@main
struct Eval {
    /// matches BATCH_SIZE in src/content.js
    static let BATCH_SIZE = 8

    /// A language named in its own words anchors the model better than a code.
    static let ENDONYM = ["nl": "Dutch (Nederlands)", "ru": "Russian (\u{0440}\u{0443}\u{0441}\u{0441}\u{043A}\u{0438}\u{0439})", "en": "English"]

    static func main() async throws {
        let level = arg("level", default: "B1")
        let dir = arg("dir", default: FileManager.default.currentDirectoryPath)

        let model = SystemLanguageModel.default
        guard case .available = model.availability else {
            FileHandle.standardError.write("on-device model unavailable: \(model.availability)\n".data(using: .utf8)!)
            exit(1)
        }

        // --abstract swaps in the no-lang-declared prompt, to measure what the
        // weaker same-language rule costs on pages with no <html lang>.
        let abstract = CommandLine.arguments.contains("--abstract")
        let fixtures = try JSONDecoder().decode(
            FixtureFile.self,
            from: Data(contentsOf: URL(fileURLWithPath: "\(dir)/fixtures.json"))
        ).blocks

        // The extension's contract is a JSON array of {i, t}. Expressing it as a
        // schema means the model cannot return prose around the array, which
        // retires the hand-rolled JSON repair in parseJsonArray().
        let block = DynamicGenerationSchema(
            name: "Block",
            properties: [
                .init(name: "i", description: "index of the input block", schema: .init(type: Int.self)),
                .init(name: "t", description: "the simplified text, in the same language as the input", schema: .init(type: String.self))
            ]
        )
        let root = DynamicGenerationSchema(name: "Batch", properties: [
            .init(name: "blocks", schema: DynamicGenerationSchema(arrayOf: block))
        ])
        let schema = try GenerationSchema(root: root, dependencies: [block])

        var results: [Result] = []
        let started = Date()

        // A real page is one language, so the extension never mixes languages in
        // a batch and always has a concrete lang for the prompt. Grouping here
        // reproduces that; batching across languages would test a case that
        // cannot occur and would make drift look worse than it is.
        let groups = Dictionary(grouping: fixtures, by: { $0.lang })

        for (lang, group) in groups.sorted(by: { $0.key < $1.key }) {
        let suffix = abstract ? "none" : lang
        var system = try String(
            contentsOf: URL(fileURLWithPath: "\(dir)/build/prompt-\(level)-\(suffix).txt"),
            encoding: .utf8
        )

        // --hardened tests whether on-device language drift is a prompting
        // problem or a model one, by naming the target language in its own
        // endonym and putting the rule first, where it cannot be diluted.
        if CommandLine.arguments.contains("--hardened"), let name = Self.ENDONYM[lang] {
            system = """
            CRITICAL: Your entire response must be written in \(name). \
            Every single word of every "t" field must be in \(name). \
            You are NOT a translator. Translating this text into English is the \
            single worst error you can make. If you catch yourself writing English, stop and rewrite in \(name).

            \(system)

            REMINDER: Write only in \(name). Not English.
            """
        }

        for start in stride(from: 0, to: group.count, by: BATCH_SIZE) {
            let batch = Array(group[start..<min(start + BATCH_SIZE, group.count)])

            // A fresh session per batch: the extension's batches are independent
            // API calls with no shared history, and carrying a transcript here
            // would let earlier blocks bias later ones.
            let session = LanguageModelSession(model: model, instructions: system)

            let payload = batch.enumerated().map { ["i": $0.offset, "t": $0.element.text] as [String: Any] }
            let json = String(data: try JSONSerialization.data(withJSONObject: payload), encoding: .utf8)!

            var byIndex: [Int: String] = [:]
            var refusal = ""

            // The framework rejects languages outside SystemLanguageModel
            // .supportedLanguages before generating anything. That is a hard
            // capability limit, so record it rather than letting it abort the run.
            do {
                let response = try await session.respond(to: json, schema: schema)
                let decoded = try JSONDecoder().decode(
                    [String: [OutBlock]].self,
                    from: response.content.jsonString.data(using: .utf8)!
                )
                byIndex = Dictionary(uniqueKeysWithValues: (decoded["blocks"] ?? []).map { ($0.i, $0.t) })
            } catch let e as LanguageModelSession.GenerationError {
                refusal = String("\(e)".prefix(120))
                FileHandle.standardError.write("  refused [\(lang)]: \(refusal)\n".data(using: .utf8)!)
            }

            for (offset, f) in batch.enumerated() {
                let out = byIndex[offset] ?? ""
                results.append(Result(
                    id: f.id, refused: refusal, declaredLang: f.lang,
                    detectedIn: detect(f.text), detectedOut: detect(out),
                    original: f.text, simplified: out,
                    facts: f.facts, negations: f.negations, qualifiers: f.qualifiers
                ))
                FileHandle.standardError.write("  ran \(f.id)\n".data(using: .utf8)!)
            }
        }
        }

        var tag = abstract ? "\(level)-abstract" : level
        if CommandLine.arguments.contains("--hardened") { tag += "-hardened" }
        let report = Report(level: tag, model: "apple-on-device",
                            secondsElapsed: Date().timeIntervalSince(started), results: results)
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
        try enc.encode(report).write(to: URL(fileURLWithPath: "\(dir)/build/results-\(tag).json"))
        FileHandle.standardError.write("wrote build/results-\(tag).json in \(Int(report.secondsElapsed))s\n".data(using: .utf8)!)
    }
}
