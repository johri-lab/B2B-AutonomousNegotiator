
import React, { useState, useEffect } from 'react';
import { Step, UserData, CompanyData, GoalsData, PricingModel, OnboardingPayload } from './types';
import { STEP_LABELS, FREE_DOMAINS, DEMO_OTP } from './constants';
import { Stepper, InputField, TextArea, Select, ReviewCard, ReviewItem } from './components/UI';
import { api } from './services/api';
import { autofillCompanyDetails, generateBusinessGoals } from './services/geminiService';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.SIGN_UP);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [showRegistry, setShowRegistry] = useState(false);
  const [registry, setRegistry] = useState<{ users: Record<string, unknown>; agents: Record<string, unknown> }>({
    users: {},
    agents: {}
  });

  // Form State
  const [user, setUser] = useState<UserData>({ 
    first_name: '', 
    last_name: '', 
    email: '', 
    company_domain: '',
    verified: false,
    verification_method: 'otp',
    role_title: ''
  });
  const [otp, setOtp] = useState('');
  const [company, setCompany] = useState<CompanyData>({
    company_name: '',
    ein: '',
    website: '',
    domains: [],
    policies: '',
    pricing_model: PricingModel.SUBSCRIPTION,
    services: []
  });
  const [goals, setGoals] = useState<GoalsData>({ short_term: '', long_term: '' });

  // Field errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentStep === Step.SUCCESS && showRegistry) {
      api.getRegistry()
        .then((data) => setRegistry(data))
        .catch((err) => setError(err.message));
    }
  }, [currentStep, showRegistry]);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return "Invalid email format";
    const domain = email.split('@')[1];
    if (FREE_DOMAINS.includes(domain)) return "Please use a business email";
    return null;
  };

  const handleNext = () => {
    if (currentStep === Step.SIGN_UP) {
      const emailErr = validateEmail(user.email);
      if (emailErr) {
        setFieldErrors({ email: emailErr });
        return;
      }
      if (!user.first_name || !user.last_name) {
        setFieldErrors({ first_name: user.first_name ? '' : 'Required', last_name: user.last_name ? '' : 'Required' });
        return;
      }
      setFieldErrors({});
      setLoading(true);
      const domain = user.email.split('@')[1];
      
      api.signup({ ...user, company_domain: domain })
        .then((newUser) => {
          setUser(newUser);
          setCurrentStep(Step.VERIFY_OTP);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    } 
    else if (currentStep === Step.VERIFY_OTP) {
      if (otp.length < 6) return;
      setLoading(true);
      api.verifyOtp(user.email, otp)
        .then(() => {
          setUser(prev => ({ ...prev, verified: true }));
          setCurrentStep(Step.COMPANY_INFO);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
    else if (currentStep === Step.COMPANY_INFO) {
      if (!company.company_name || !company.website) return;
      setCurrentStep(Step.GOALS);
    }
    else if (currentStep === Step.GOALS) {
      setCurrentStep(Step.REVIEW);
    }
  };

  const handleAutofill = async () => {
    const domain = user.email.split('@')[1];
    setLoading(true);
    try {
      const data = await autofillCompanyDetails(domain);
      const services = typeof data.services === 'string' ? data.services.split('.').filter(Boolean) : data.services;
      setCompany({
        ...company,
        ...data,
        services,
        ein: '' 
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateGoals = async () => {
    setLoading(true);
    try {
      const generated = await generateBusinessGoals(company);
      setGoals(generated);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = () => {
    setLoading(true);
    const payload: OnboardingPayload = { 
      user: user, 
      agent: {
        company_context: company,
        goals: goals
      }
    };
    api.createAgent(payload)
      .then(res => {
        setAgentId(res.agent_id);
        setCurrentStep(Step.SUCCESS);
        return api.getRegistry();
      })
      .then((data) => {
        if (data) {
          setRegistry(data);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const renderContent = () => {
    switch (currentStep) {
      case Step.SIGN_UP:
        return (
          <div className="space-y-4 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Welcome to Bot Business Forum</h2>
            <p className="text-slate-500 mb-6">Let's get your company bot verified and active.</p>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="First Name" value={user.first_name} onChange={(v) => setUser({...user, first_name: v})} error={fieldErrors.first_name} required />
              <InputField label="Last Name" value={user.last_name} onChange={(v) => setUser({...user, last_name: v})} error={fieldErrors.last_name} required />
            </div>
            <InputField label="Business Email" placeholder="you@company.com" value={user.email} onChange={(v) => setUser({...user, email: v})} error={fieldErrors.email} required />
            <InputField label="Role Title (Optional)" placeholder="e.g. CEO, Head of Strategy" value={user.role_title || ''} onChange={(v) => setUser({...user, role_title: v})} />
            <button onClick={handleNext} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg shadow-md transition-all flex items-center justify-center">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Send OTP"}
            </button>
          </div>
        );

      case Step.VERIFY_OTP:
        return (
          <div className="space-y-4 animate-fadeIn">
            <h2 className="text-2xl font-bold text-slate-800">Verify your identity</h2>
            <p className="text-slate-500 mb-6">Sent to <span className="font-semibold text-slate-700">{user.email}</span>.</p>
            <InputField label="OTP Code" placeholder="123456" value={otp} onChange={setOtp} error={error || undefined} />
            <button onClick={handleNext} disabled={loading || otp.length < 6} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg shadow-md transition-all flex items-center justify-center">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Verify"}
            </button>
          </div>
        );

      case Step.COMPANY_INFO:
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-slate-800">Agent Context</h2>
              <button onClick={handleAutofill} disabled={loading} className="text-xs font-semibold text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-full hover:bg-indigo-50 transition-all flex items-center gap-2">
                {loading ? <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : '✨ Autofill'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="Company Name" value={company.company_name} onChange={(v) => setCompany({...company, company_name: v})} required />
              <InputField label="Website" placeholder="https://..." value={company.website} onChange={(v) => setCompany({...company, website: v})} required />
              <InputField label="EIN (Optional)" value={company.ein} onChange={(v) => setCompany({...company, ein: v})} />
              <Select label="Pricing Model" options={Object.values(PricingModel)} value={company.pricing_model} onChange={(v) => setCompany({...company, pricing_model: v as PricingModel})} />
            </div>
            <TextArea label="Services Offered" placeholder="List services offered by this bot initiative..." value={company.services.join('. ')} onChange={(v) => setCompany({...company, services: v.split('.').map(s => s.trim()).filter(Boolean)})} />
            <button onClick={handleNext} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg shadow-md transition-all">Continue to Goals</button>
          </div>
        );

      case Step.GOALS:
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-slate-800">Bot Mission</h2>
              <button onClick={handleGenerateGoals} disabled={loading} className="text-xs font-semibold text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-full hover:bg-indigo-50 transition-all flex items-center gap-2">
                {loading ? <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : '✨ Generate Goals'}
              </button>
            </div>
            <TextArea label="Short-term Goals" value={goals.short_term} onChange={(v) => setGoals({...goals, short_term: v})} rows={4} />
            <TextArea label="Long-term Goals" value={goals.long_term} onChange={(v) => setGoals({...goals, long_term: v})} rows={4} />
            <button onClick={handleNext} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg shadow-md transition-all">Review Application</button>
          </div>
        );

      case Step.REVIEW:
        return (
          <div className="space-y-4 animate-fadeIn overflow-y-auto max-h-[80vh]">
            <h2 className="text-2xl font-bold text-slate-800">Final Review</h2>
            <ReviewCard title="User Account (Owner)">
              <ReviewItem label="Name" value={`${user.first_name} ${user.last_name}`} />
              <ReviewItem label="Role" value={user.role_title || "N/A"} />
              <ReviewItem label="Email" value={user.email} />
              <ReviewItem label="User ID" value={user.user_id || "Pending"} />
            </ReviewCard>
            <ReviewCard title="Agent Company Context">
              <ReviewItem label="Company" value={company.company_name} />
              <ReviewItem label="Pricing" value={company.pricing_model} />
              <ReviewItem label="Services" value={company.services} />
            </ReviewCard>
            <ReviewCard title="Mission Goals">
              <ReviewItem label="Short-term" value={goals.short_term} />
              <ReviewItem label="Long-term" value={goals.long_term} />
            </ReviewCard>
            <button onClick={handleCreateAgent} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 mb-8">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "🚀 Create Business Agent"}
            </button>
          </div>
        );

      case Step.SUCCESS:
        return (
          <div className="text-center py-6 animate-bounceIn overflow-y-auto max-h-[85vh]">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Agent Registered</h2>
            <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">Your bot is now registered in the persistent mock registry.</p>
            
            <div className="bg-slate-50 p-3 rounded-lg inline-block border border-slate-200 mb-6">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Agent ID</p>
              <code className="text-md font-mono text-indigo-600 font-bold">{agentId}</code>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-6">
                <button 
                  onClick={() => setShowRegistry(!showRegistry)}
                  className="text-xs text-indigo-600 font-semibold hover:underline mb-4 block mx-auto"
                >
                  {showRegistry ? "Hide Registry Inspector" : "View Registry Inspector (JSON Mock DB)"}
                </button>

                {showRegistry && (
                  <div className="text-left space-y-4 animate-fadeIn">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">users.json (Mocked in LocalStorage)</h4>
                      <pre className="bg-slate-900 text-indigo-300 p-4 rounded-lg text-[10px] overflow-x-auto max-h-40 overflow-y-auto font-mono">
                        {JSON.stringify(registry.users, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">agents.json (Mocked in LocalStorage)</h4>
                      <pre className="bg-slate-900 text-emerald-300 p-4 rounded-lg text-[10px] overflow-x-auto max-h-40 overflow-y-auto font-mono">
                        {JSON.stringify(registry.agents, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
            </div>

            <div className="mt-8">
              <button onClick={() => window.location.reload()} className="text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors">Register Another Agent</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row">
        <div className="hidden md:flex md:w-1/3 bg-slate-900 p-8 flex-col justify-between text-white">
          <div>
            <div className="flex items-center gap-2 mb-8">
              <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h1 className="text-xl font-bold tracking-tight">BBF</h1>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">Trusted B2B Bot-to-Bot Commerce Network.</p>
          </div>
          <div className="text-xs text-slate-500">&copy; 2024 Bot Business Forum.</div>
        </div>
        <div className="flex-1 p-6 md:p-12 overflow-y-auto max-h-screen">
          {currentStep !== Step.SUCCESS && <Stepper steps={STEP_LABELS} currentStep={currentStep} />}
          {renderContent()}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounceIn { 0% { transform: scale(0.95); opacity: 0; } 70% { transform: scale(1.02); opacity: 1; } 100% { transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-bounceIn { animation: bounceIn 0.5s ease-out forwards; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
