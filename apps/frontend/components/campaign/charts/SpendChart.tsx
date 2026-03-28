import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ReportRecord } from '@/types/campaign';

interface SpendChartProps {
    data: ReportRecord[];
}

export function SpendChart({ data }: SpendChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                No spend data available
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                    dataKey="date" 
                    stroke="#9CA3AF"
                    fontSize={12}
                />
                <YAxis 
                    stroke="#9CA3AF"
                    fontSize={12}
                    tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1F2937', 
                        border: '1px solid #374151',
                        borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#F3F4F6' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']}
                />
                <Line 
                    type="monotone" 
                    dataKey="spend" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    dot={{ fill: '#10B981', r: 4 }}
                    activeDot={{ r: 6 }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

