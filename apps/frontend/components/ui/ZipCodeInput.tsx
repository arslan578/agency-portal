import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Loader2 } from 'lucide-react';

interface ZipCodeInputProps {
    onLocationFound: (city: string, state: string, zip: string) => void;
    className?: string;
}

const CLIENT_KEY = "js-IzdkXAtSGYLoFP6CjnotuMd385mqufkoYYsKQQvpxuee5zJUrCap8WKDzXSitvmH";

export function ZipCodeInput({ onLocationFound, className }: ZipCodeInputProps) {
    const [zipcode, setZipcode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchLocation = async (zip: string) => {
            setLoading(true);
            setError('');

            try {
                // Using the client-side key as requested
                const url = `https://www.zipcodeapi.com/rest/${CLIENT_KEY}/info.json/${zip}/radians`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('Failed to fetch location data');
                }

                const data = await response.json();

                if (data.error_msg) {
                    setError(data.error_msg);
                } else if (data.city && data.state) {
                    onLocationFound(data.city, data.state, zip);
                }
            } catch (err) {
                console.error(err);
                setError('Could not find location. Please enter manually.');
            } finally {
                setLoading(false);
            }
        };

        if (zipcode.length === 5 && /^[0-9]+$/.test(zipcode)) {
            fetchLocation(zipcode);
        } else {
            setError('');
        }
    }, [zipcode, onLocationFound]);

    return (
        <div className={className}>
            <Label>Zip Code Lookup</Label>
            <div className="relative">
                <Input
                    placeholder="Enter 5-digit Zip Code"
                    value={zipcode}
                    onChange={(e) => setZipcode(e.target.value.substring(0, 5))}
                    maxLength={5}
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                )}
            </div>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
    );
}
