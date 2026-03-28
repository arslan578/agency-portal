import { VariantGenerator } from '@/components/creative/VariantGenerator';

export default function CreativePage() {
    return (
        <div className="max-w-7xl mx-auto">
            <header className="mb-12 flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold text-foreground mb-2">Create Ad Copy</h1>
                    <p className="text-gray-400 text-lg">AI-powered creative variant generation for high-converting ad copy</p>
                </div>
            </header>
            <VariantGenerator />
        </div>
    );
}
