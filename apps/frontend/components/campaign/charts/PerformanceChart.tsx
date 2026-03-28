import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ReportRecord } from '@/types/campaign';

interface PerformanceChartProps {
    data: ReportRecord[];
}

export function PerformanceChart({ data }: PerformanceChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                No performance data available
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF"
                    fontSize={12}
                />
                <YAxis 
                    stroke="#9CA3AF"
                    fontSize={12}
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1F2937', 
                        border: '1px solid #374151',
                        borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#F3F4F6' }}
                />
                <Legend 
                    wrapperStyle={{ color: '#9CA3AF' }}
                />
                <Bar 
                    dataKey="impressions" 
                    fill="#3B82F6" 
                    name="Impressions"
                    radius={[4, 4, 0, 0]}
                />
                <Bar 
                    dataKey="clicks" 
                    fill="#8B5CF6" 
                    name="Clicks"
                    radius={[4, 4, 0, 0]}
                />
            </BarChart>
        </ResponsiveContainer>
    );
}

