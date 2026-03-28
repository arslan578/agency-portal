import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { DollarSign, TrendingUp, MousePointer, Eye } from 'lucide-react';
import { Campaign } from '@/types/campaign';

interface CampaignMetricsProps {
    campaign: Campaign;
}

export function CampaignMetrics({ campaign }: CampaignMetricsProps) {
    const budgetDollars = (campaign.total_budget_cents / 100).toFixed(2);

    const metrics = [
        {
            label: 'Total Budget',
            value: `$${budgetDollars}`,
            icon: DollarSign,
            color: 'text-green-500',
        },
        {
            label: 'Goal',
            value: campaign.goal ? campaign.goal.charAt(0).toUpperCase() + campaign.goal.slice(1) : 'Not Set',
            icon: TrendingUp,
            color: 'text-blue-500',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.map((metric, index) => (
                <Card key={index}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-400">{metric.label}</p>
                                <h3 className="text-2xl font-bold mt-1 text-foreground">{metric.value}</h3>
                            </div>
                            <div className={`p-3 rounded-full bg-white/5 ${metric.color}`}>
                                <metric.icon className="h-5 w-5" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

