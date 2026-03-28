'use client';

import { useState } from 'react';
import { FaChartLine, FaUsers, FaServer, FaExclamationTriangle } from 'react-icons/fa';

export default function AdminDashboard() {
    const [stats] = useState([
        { title: 'Active Users', value: '1,234', icon: FaUsers, color: 'text-blue-500' },
        { title: 'Total Campaigns', value: '856', icon: FaChartLine, color: 'text-green-500' },
        { title: 'System Status', value: 'Healthy', icon: FaServer, color: 'text-purple-500' },
        { title: 'Alerts', value: '0', icon: FaExclamationTriangle, color: 'text-yellow-500' },
    ]);

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {stats.map((stat, index) => (
                    <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.title}</p>
                                <h3 className="text-2xl font-bold mt-2">{stat.value}</h3>
                            </div>
                            <stat.icon className={`text-2xl ${stat.color}`} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <div>
                                    <p className="font-medium">New user registration</p>
                                    <p className="text-sm text-gray-500">2 minutes ago</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 className="text-xl font-bold mb-4">System Health</h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span>API Latency</span>
                            <span className="text-green-500 font-medium">45ms</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full" style={{ width: '20%' }} />
                        </div>

                        <div className="flex justify-between items-center mt-4">
                            <span>Database Load</span>
                            <span className="text-green-500 font-medium">12%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full" style={{ width: '12%' }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
