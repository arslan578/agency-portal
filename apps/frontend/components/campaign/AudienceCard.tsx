import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Loader2, Users, Globe, Languages as LanguagesIcon, Target, Edit } from 'lucide-react';
import { Audience } from '@/types/campaign';

interface AudienceCardProps {
    audience: Audience | null;
    loading?: boolean;
    onEdit?: () => void;
}

export function AudienceCard({ audience, loading, onEdit }: AudienceCardProps) {
    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Target Audience
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!audience) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Target Audience
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No audience configured for this campaign
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Target Audience
                    </CardTitle>
                    {onEdit && (
                        <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
                            <Edit className="h-4 w-4" />
                            Edit Targeting
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <h3 className="font-semibold text-foreground mb-1">{audience.name}</h3>
                    {audience.description && (
                        <p className="text-sm text-gray-400">{audience.description}</p>
                    )}
                </div>

                {/* Geographic Targeting */}
                {audience.definition?.geo && audience.definition.geo.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Globe className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-300">Geographic Targeting</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {audience.definition.geo.map((country) => (
                                <Badge key={country} variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                                    {country}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Languages */}
                {audience.definition?.languages && audience.definition.languages.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <LanguagesIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-300">Languages</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {audience.definition.languages.map((lang) => (
                                <Badge key={lang} variant="secondary" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                    {lang}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {/* Interests */}
                {audience.definition?.interests && audience.definition.interests.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-300">Interests</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {audience.definition.interests.map((interest) => (
                                <Badge key={interest} variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                                    {interest}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

