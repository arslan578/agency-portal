const decoder = require("../../kaivo_os/os_65_connector_registry/os_65_connector_registration_decoder");
const crypto = require("crypto");

function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    return Object.keys(obj).sort().reduce((acc, key) => {
        acc[key] = sortObjectKeys(obj[key]);
        return acc;
    }, {});
}

function sha256Canonical(obj) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(sortObjectKeys(obj)))
        .digest("hex");
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Mock artifacts for TikTok (structure mirrors Google)
const CAPABILITY = { caps: "A_TikTok" };
const IO = { io: "B_TikTok" };
const POLICY = { pol: "C_TikTok" };
const SAFETY = { safe: "D_TikTok" };
const REPLAY = { rep: "E_TikTok" };
const READY = { ready: "F_TikTok", version: "1.0.0", connector_id: "tiktok_ads" };
const CHECK = { check: "G_TikTok" };

// TikTok uses 12 phases
const PIB_HASH_CHAIN = {};
for (let i = 1; i <= 12; i++) {
    PIB_HASH_CHAIN[String(i)] = { canonical_hash: `tiktok_hash${i}` };
}

const CONNECTOR_REGISTRATION_PACKET = {
    connector_id: "tiktok_ads",
    connector_version: READY.version,
    hash_chain: PIB_HASH_CHAIN,
    capability_surface_signature: sha256Canonical(CAPABILITY),
    io_surface_signature: sha256Canonical(IO),
    policy_mirror_signature: sha256Canonical(POLICY),
    safety_horizon_signature: sha256Canonical(SAFETY),
    replay_validation_signature: sha256Canonical(REPLAY),
    readiness_certificate_signature: sha256Canonical(READY),
    activation_checkpoint_signature: sha256Canonical(CHECK)
};

const BASE_INPUT = {
    execution_id: "e2e-tiktok-os65-1",
    phase: "OS_65",
    feature_flags: { FF_OS_CONNECTOR_REGISTRATION: true },

    connector_registration_packet: CONNECTOR_REGISTRATION_PACKET,

    capability_surface: CAPABILITY,
    io_surface: IO,
    routing_profile: { policy_mirror: POLICY },
    safety_horizon_binding: SAFETY,
    replay_validation_record: REPLAY,
    readiness_certificate: READY,
    activation_checkpoint_record: CHECK
};

describe("OS-65 TikTok E2E Smoke Test", () => {
    test("TikTok PIB packet -> OS-65 decoder -> connector_registry.tiktok_ads", () => {
        const input = deepCopy(BASE_INPUT);

        const result = decoder.execute(input);

        // Basic success
        if (result.status !== "OK") {
            console.error("TikTok OS-65 Error:", JSON.stringify(result, null, 2));
        }
        expect(result.status).toBe("OK");
        expect(result.phase).toBe("OS_65");
        expect(result.output_contract_version).toBe("os_65_connector_registry_v2");

        // Registry entry exists
        expect(result.connector_registry).toBeDefined();
        // Expect tiktok_ads entry
        expect(result.connector_registry.tiktok_ads).toBeDefined();

        const entry = result.connector_registry.tiktok_ads;

        // Identity + version
        expect(entry.connector_id).toBe("tiktok_ads");
        expect(entry.version).toBe("1.0.0");

        // Canonical hash present and well-formed
        expect(entry.canonical_hash).toMatch(/^[a-f0-9]{64}$/);

        // Hash chain propagated (checking logical existence of PIB phases)
        expect(entry.pib_hash_chain).toBeDefined();
        expect(entry.pib_hash_chain["12"]).toBeDefined();
        expect(entry.pib_hash_chain["12"].canonical_hash).toBe("tiktok_hash12");

        // Determinism sanity check
        const result2 = decoder.execute(deepCopy(BASE_INPUT));
        expect(result.metadata.canonical_hash).toBe(result2.metadata.canonical_hash);
    });
});
