'use client'

export const runtime = 'edge';

import React, { useState } from 'react'
import { buttonVariants } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useTranslation } from '@/context/LanguageContext'
import { Textarea } from '@/components/ui/Textarea'
import { Edit2, RefreshCw, Upload } from 'lucide-react'
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function BrandProfilePage({ params }: { params: { id: string } }) {
    const [isEditing, setIsEditing] = useState(false)

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <header className="mb-8 flex justify-between items-center">
                <h1 className="text-3xl font-bold text-kaivo-teal-deep">Brand Profile</h1>
                <button className={cn(buttonVariants({ variant: isEditing ? 'primary' : 'secondary' }))} onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? 'Save Changes' : 'Edit Profile'}
                </button>
            </header>

            <div className="space-y-8">
                {/* Core Identity */}
                <Card>
                    <h2 className="text-lg font-bold text-kaivo-teal-deep mb-6">Core Identity</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Brand Name" defaultValue="Acme Corp" disabled={!isEditing} />
                        <Input label="Website" defaultValue="https://acme.com" disabled={!isEditing} />
                        <div className="md:col-span-2">
                            <Textarea
                                label="Mission Statement"
                                defaultValue="To provide the best widgets in the world."
                                disabled={!isEditing}
                                className="h-24"
                            />
                            {isEditing && (
                                <button
                                    className="text-xs text-kaivo-teal-emerald font-medium mt-1 hover:underline"
                                    onClick={() => toast.info('Trigger Orchestrator: Rewrite this in Spanish')}
                                >
                                    Ask Kaivo: Rewrite in Spanish
                                </button>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Brand Voice & Tone */}
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-kaivo-teal-deep">Voice & Tone</h2>
                        <button className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex items-center gap-2")}>
                            <RefreshCw className="w-4 h-4" /> Regenerate Voice Model
                        </button>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Detected Tone</h3>
                        <div className="flex flex-wrap gap-2">
                            {['Professional', 'Trustworthy', 'Innovative', 'Direct'].map(tag => (
                                <span key={tag} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm font-medium text-kaivo-teal-deep">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Textarea
                            label="Do's"
                            defaultValue="- Use active voice\n- Be concise\n- Focus on benefits"
                            disabled={!isEditing}
                            className="h-32"
                        />
                        <Textarea
                            label="Dont's"
                            defaultValue="- No jargon\n- No passive voice\n- Avoid slang"
                            disabled={!isEditing}
                            className="h-32"
                        />
                    </div>
                </Card>

                {/* Knowledge Base */}
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-kaivo-teal-deep">Knowledge Base</h2>
                        <button className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex items-center gap-2")}>
                            <Upload className="w-4 h-4" /> Upload Document
                        </button>
                    </div>
                    <div className="space-y-3">
                        {[
                            { name: 'Brand_Guidelines_2025.pdf', size: '2.4 MB', date: 'Oct 12, 2025' },
                            { name: 'Product_Catalog_v2.csv', size: '1.1 MB', date: 'Oct 15, 2025' },
                            { name: 'About_Us_Draft.docx', size: '450 KB', date: 'Oct 20, 2025' },
                        ].map(doc => (
                            <div key={doc.name} className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-500">
                                        📄
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{doc.name}</p>
                                        <p className="text-xs text-gray-500">{doc.size} • Uploaded {doc.date}</p>
                                    </div>
                                </div>
                                <button className="text-kaivo-teal-emerald hover:underline text-sm font-medium">View</button>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    )
}
