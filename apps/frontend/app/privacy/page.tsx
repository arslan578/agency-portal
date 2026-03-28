import React from 'react';

export default function PrivacyPolicyPage() {
    return (
        <div className="max-w-4xl mx-auto py-12 px-8 text-white">
            <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
            <div className="prose prose-invert max-w-none space-y-6 text-black">
                <p><strong>Effective Date:</strong> November 24, 2025<br />
                    <strong>Provider:</strong> UMedia2, Inc.<br />
                    <strong>Registered Address:</strong> 8 The Green, Suite B, Dover, DE, USA, Zip Code 19901<br />
                    <strong>Jurisdiction:</strong> The State of Delaware, United States of America</p>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">1. Introduction</h2>
                    <p>This Privacy Policy describes how UMedia2, Inc. collects, uses, stores, protects, and shares information collected through the Kaivo platform. Users who access the Platform agree to the collection and use of information as described.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">2. Categories of Information Collected</h2>
                    <p>UMedia2, Inc. collects the following types of information:</p>

                    <h3 className="text-xl font-semibold text-white mt-4 mb-2">a. Information Provided by Users</h3>
                    <p>Account information, creative assets, campaign configurations, payment information, and communication records.</p>

                    <h3 className="text-xl font-semibold text-white mt-4 mb-2">b. Information Collected Automatically</h3>
                    <p>Log files, device information, IP addresses, session data, clickstream activity, venue performance data, optimization signals, event traces, behavioral data, and fraud indicators.</p>

                    <h3 className="text-xl font-semibold text-white mt-4 mb-2">c. Information Obtained from Third Parties</h3>
                    <p>Data returned by advertising venues, payment processors, analytics providers, and verification authorities.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">3. Use of Information</h2>
                    <p>UMedia2, Inc. uses information for:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Campaign execution</li>
                        <li>Reporting and analytics</li>
                        <li>System improvement</li>
                        <li>Model training and refinement</li>
                        <li>Benchmark creation</li>
                        <li>Fraud detection</li>
                        <li>Translation quality improvement</li>
                        <li>Audience analysis</li>
                        <li>Research and development</li>
                        <li>Service delivery</li>
                        <li>Compliance with law</li>
                        <li>Internal business operations</li>
                    </ul>
                    <p className="mt-4">UMedia2, Inc. may use information to develop new products or services that rely on data processed through the Platform.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">4. Derived Intelligence and Aggregated Data</h2>
                    <p>UMedia2, Inc. owns all Derived Intelligence created through Platform usage. Derived Intelligence may be retained indefinitely and used for any business purpose.</p>
                    <p>Derived Intelligence never includes personal information and cannot identify any individual or business.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">5. Sharing of Information</h2>
                    <p>UMedia2, Inc. may share information with the following parties:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Advertising venues</li>
                        <li>Cloud hosting providers</li>
                        <li>Payment processors</li>
                        <li>Security vendors</li>
                        <li>Analytics providers</li>
                        <li>Legal authorities when required</li>
                        <li>Contractors who support Platform operations</li>
                    </ul>
                    <p className="mt-4">Each party that receives information must follow confidentiality obligations.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">6. Data Retention</h2>
                    <p>UMedia2, Inc. retains information for as long as necessary to operate the Platform, meet business requirements, comply with law, resolve disputes, or enforce agreements. Derived Intelligence may be retained without time limitation.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">7. User Rights</h2>
                    <p>Users may request access, correction, or deletion of personal information as required by law. Derived Intelligence is not subject to access or deletion requests because it does not identify individuals and is owned by UMedia2, Inc.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">8. Data Security</h2>
                    <p>UMedia2, Inc. implements commercially reasonable security measures to protect information. No system can guarantee complete security, but UMedia2, Inc. maintains safeguards designed to reduce risk.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">9. Cookies and Tracking Technologies</h2>
                    <p>UMedia2, Inc. uses cookies and similar technologies to authenticate users, maintain sessions, gather analytics, and improve Platform functionality. Users may adjust browser settings to manage cookies.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">10. International Transfers</h2>
                    <p>Information may be processed in or transferred to the United States. Users who access the Platform consent to this transfer.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">11. Children’s Privacy</h2>
                    <p>The Platform is not intended for individuals under thirteen years old. Any collected information will be removed promptly.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">12. Changes to this Policy</h2>
                    <p>UMedia2, Inc. may update this Privacy Policy at any time. Significant changes may be communicated by posting a notice on the Platform.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-bold text-white mt-8 mb-4">13. Contact Information</h2>
                    <p>UMedia2, Inc.<br />
                        8 The Green, Suite B<br />
                        Dover, DE, USA<br />
                        Zip Code 19901<br />
                        <a href="mailto:privacy@getkaivo.com" className="text-kaivo-teal-neon hover:underline">privacy@getkaivo.com</a></p>
                </section>
            </div>
        </div>
    );
}
