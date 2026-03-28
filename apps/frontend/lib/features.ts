export const features = {
    // Enabled only in Staging via env var
    stagingTestMode: process.env.NEXT_PUBLIC_FF_STAGING_TEST_MODE === 'true',

    // Parked features (Default OFF)
    productKnowledgeUi: process.env.NEXT_PUBLIC_FF_PRODUCT_KNOWLEDGE_UI === 'true',
    aiCreativeGeneration: process.env.NEXT_PUBLIC_FF_AI_CREATIVE_GENERATION === 'true',
    onboardingWizard: process.env.NEXT_PUBLIC_FF_ONBOARDING_WIZARD === 'true',
    driftUi: process.env.NEXT_PUBLIC_FF_DRIFT_UI === 'true',
};
