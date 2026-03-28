"use client"

import { useState } from 'react'
import { buttonVariants } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ArrowRight, Check, Loader2, Upload, X, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils';
import { useCloudinaryUpload } from '@/lib/cloudinary';
import { toast } from 'sonner';

interface ProductDoc {
    cloudinary_url: string
    title: string
    uploading: boolean
    uploaded: boolean
}

export default function OnboardingPage() {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const { upload: uploadToCloudinary, uploading: cloudinaryUploading } = useCloudinaryUpload()
    const [formData, setFormData] = useState({
        brandName: '',
        website: '',
        brandDescription: '',
        productDocs: [] as ProductDoc[],
        productDescription: '',
        goals: [] as string[],
        budget: 5000
    })

    const handleCloudinaryUpload = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.txt,.md';
        input.onchange = async (e: any) => {
            const file = e.target?.files?.[0];
            if (!file) return;

            try {
                const result = await uploadToCloudinary(file, {
                    folder: 'product-docs',
                    resourceType: 'raw',
                    allowedFormats: ['pdf', 'doc', 'docx', 'txt', 'md'],
                    maxFileSize: 50000000,
                });
                if (result) {
                    const newDoc: ProductDoc = {
                        cloudinary_url: result.secure_url,
                        title: result.public_id.split('/').pop() || 'Document',
                        uploading: false,
                        uploaded: false
                    };
                    setFormData({ ...formData, productDocs: [...formData.productDocs, newDoc] });
                    toast.success('Document uploaded successfully!');
                }
            } catch (error) {
                toast.error('Failed to upload document');
            }
        };
        input.click();
    }

    const removeDoc = (index: number) => {
        const newDocs = formData.productDocs.filter((_, i) => i !== index)
        setFormData({ ...formData, productDocs: newDocs })
    }

    const handleNext = async () => {
        if (step < 4) {
            // Upload product docs when leaving step 2
            if (step === 2 && formData.productDocs.length > 0) {
                setLoading(true)
                try {
                    // Upload each document to backend (already uploaded to Cloudinary)
                    for (let i = 0; i < formData.productDocs.length; i++) {
                        const doc = formData.productDocs[i]
                        if (doc.uploaded) continue

                        // Placeholder brand_id - will be replaced with actual after brand creation
                        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com'}/creative/brands/1/product-docs`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                cloudinary_url: doc.cloudinary_url,
                                title: doc.title
                            })
                        })

                        if (res.ok) {
                            const updatedDocs = [...formData.productDocs]
                            updatedDocs[i].uploaded = true
                            setFormData({ ...formData, productDocs: updatedDocs })
                        }
                    }
                } catch (error) {
                    toast.error('Failed to save documents')
                } finally {
                    setLoading(false)
                }
            }

            setStep(step + 1)
        } else {
            // Final submit
            setLoading(true)
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://kaivo-backend.onrender.com'}/onboarding/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        brand_name: formData.brandName,
                        website: formData.website,
                        brand_description: formData.brandDescription,
                        product_description: formData.productDescription,
                        goals: formData.goals,
                        budget: formData.budget
                    })
                })
                if (res.ok) {
                    router.push('/dashboard')
                }
            } catch (error) {
                toast.error('Onboarding failed')
            } finally {
                setLoading(false)
            }
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-2xl p-8 bg-kaivo-dark-card border-kaivo-dark-border">
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-2xl font-bold text-white">Welcome to Kaivo</h1>
                        <span className="text-kaivo-teal-neon text-sm">Step {step} of 4</span>
                    </div>
                    <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-kaivo-teal-neon transition-all duration-500"
                            style={{ width: `${(step / 4) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="min-h-[300px]">
                    {step === 1 && (
                        <div className="space-y-4">
                            <h2 className="text-xl text-white">Tell us about your brand</h2>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Brand Name *</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/20 border border-white/10 rounded-md p-3 text-white focus:border-kaivo-teal-neon outline-none"
                                    value={formData.brandName}
                                    onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                                    placeholder="Acme Corp"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Website</label>
                                <input
                                    type="url"
                                    className="w-full bg-black/20 border border-white/10 rounded-md p-3 text-white focus:border-kaivo-teal-neon outline-none"
                                    value={formData.website}
                                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                    placeholder="https://acme.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Brand Description</label>
                                <textarea
                                    className="w-full bg-black/20 border border-white/10 rounded-md p-3 text-white focus:border-kaivo-teal-neon outline-none resize-none"
                                    rows={3}
                                    value={formData.brandDescription}
                                    onChange={(e) => setFormData({ ...formData, brandDescription: e.target.value })}
                                    placeholder="Brief description of your brand..."
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h2 className="text-xl text-white">Product Knowledge</h2>
                            <p className="text-gray-400 text-sm">Upload product docs to help Kaivo create better campaigns</p>

                            {/* File Upload */}
                            <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-kaivo-teal-neon transition-colors">
                                <button
                                    onClick={handleCloudinaryUpload}
                                    disabled={cloudinaryUploading}
                                    className="w-full"
                                >
                                    {cloudinaryUploading ? (
                                        <>
                                            <Loader2 className="w-12 h-12 mx-auto mb-4 text-kaivo-teal-neon animate-spin" />
                                            <span className="text-white font-medium">Uploading...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                                            <span className="text-white font-medium">Click to upload documents</span>
                                            <p className="text-xs text-gray-500 mt-1">PDF, DOC, DOCX, TXT, MD</p>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Uploaded Files List */}
                            {formData.productDocs.length > 0 && (
                                <div className="space-y-2">
                                    {formData.productDocs.map((doc, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-md border border-white/10">
                                            <div className="flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-kaivo-teal-neon" />
                                                <span className="text-sm text-white">{doc.title}</span>
                                                {doc.uploaded && (
                                                    <Check className="w-4 h-4 text-green-500" />
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeDoc(i)}
                                                className="text-gray-500 hover:text-red-500"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Optional Description */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Tell Kaivo what you sell and who you serve</label>
                                <textarea
                                    className="w-full bg-black/20 border border-white/10 rounded-md p-3 text-white focus:border-kaivo-teal-neon outline-none resize-none"
                                    rows={4}
                                    value={formData.productDescription}
                                    onChange={(e) => setFormData({ ...formData, productDescription: e.target.value })}
                                    placeholder="We sell luxury skincare products to affluent women aged 25-45..."
                                />
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h2 className="text-xl text-white">What are your goals?</h2>
                            <div className="grid grid-cols-2 gap-4">
                                {['Awareness', 'Traffic', 'Leads', 'Sales'].map((goal) => (
                                    <div
                                        key={goal}
                                        onClick={() => {
                                            const newGoals = formData.goals.includes(goal)
                                                ? formData.goals.filter(g => g !== goal)
                                                : [...formData.goals, goal]
                                            setFormData({ ...formData, goals: newGoals })
                                        }}
                                        className={`p-4 rounded-lg border cursor-pointer transition-all ${formData.goals.includes(goal)
                                            ? 'border-kaivo-teal-neon bg-kaivo-teal-neon/10 text-white'
                                            : 'border-white/10 hover:border-white/30 text-gray-400'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span>{goal}</span>
                                            {formData.goals.includes(goal) && <Check className="w-4 h-4 text-kaivo-teal-neon" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <h2 className="text-xl text-white">Monthly Ad Budget</h2>
                            <div className="pt-8 px-4">
                                <input
                                    type="range"
                                    min="1000"
                                    max="100000"
                                    step="1000"
                                    className="w-full accent-kaivo-teal-neon"
                                    value={formData.budget}
                                    onChange={(e) => setFormData({ ...formData, budget: parseInt(e.target.value) })}
                                />
                                <div className="text-center mt-4">
                                    <span className="text-3xl font-bold text-white">${formData.budget.toLocaleString()}</span>
                                    <span className="text-gray-400">/mo</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-between mt-8">
                    {step > 1 && (
                        <button
                            onClick={() => setStep(step - 1)}
                            className={cn(buttonVariants({ variant: "ghost" }), "text-gray-400")}
                        >
                            Back
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        disabled={loading}
                        className={cn(buttonVariants(), "bg-kaivo-teal-neon text-black hover:bg-kaivo-teal-neon/90 ml-auto")}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                            <>
                                {step === 4 ? 'Complete Onboarding' : 'Next Step'}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </button>
                </div>
            </Card>
        </div>
    )
}
