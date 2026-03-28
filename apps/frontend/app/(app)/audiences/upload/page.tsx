import { AudienceUploader } from '@/components/audience/AudienceUploader';
import { ClientSelector } from '@/components/agency/ClientSelector';

export default function AudienceUploadPage() {
    return (
        <div className="container mx-auto py-10 max-w-xl">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h1 className="text-3xl font-bold">Audience Manager</h1>
                <ClientSelector />
            </div>
            <AudienceUploader />
        </div>
    );
}
