import { AnimatePresence, motion } from 'motion/react';
import React, { useState } from 'react';
import { DynamicList } from './components/DynamicList';
import { Input } from './components/Input';
import { TextArea } from './components/TextArea';
import { RadioGroup } from './components/RadioGroup';
import { Select } from './components/Select';
import { CheckCircle2, Loader2, Wrench, ArrowRight } from 'lucide-react';
import { KeywordTable } from './components/KeywordTable';
import { SitemapTable } from './components/SitemapTable';
import { streamKeywords, streamSitemap } from './services/api';
import { Header } from './components/Header';

type FieldType = 'input' | 'textarea' | 'list' | 'radio' | 'select';

interface Field {
  id: string;
  title: string;
  subtitle?: string;
  type: FieldType;
  inputType?: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

interface Step {
  id: string;
  title: string;
  description?: string;
  fields: Field[];
}

const steps: Step[] = [
  {
    id: 'brief',
    title: 'SEO Project Brief',
    description: 'Please fill out this brief questionnaire to help us understand your business and target the most valuable search terms for your campaign.',
    fields: [
      {
        id: 'businessName',
        title: '1. Business Name',
        type: 'input',
        placeholder: 'e.g. SolarTH',
        required: true
      },
      {
        id: 'websiteUrl',
        title: '2. Website URL',
        type: 'input',
        inputType: 'url',
        placeholder: 'https://example.com',
        required: false
      },
      {
        id: 'businessDescription',
        title: '3. Business Description & Core Offerings',
        subtitle: 'What does your business do and what are your primary services/products? Example: SolarTH is an online platform that aggregates solar installation companies in Thailand. It allows consumers (homeowners, businesses, factories) to search, compare prices, and find qualified installers for their solar system needs.',
        type: 'textarea',
        placeholder: 'Describe your business, what it does, and its primary services/products...',
        required: true
      },
      {
        id: 'focusProductLines',
        title: '4. Focus Product Lines (Optional)',
        subtitle: 'If you have a diverse business, what 1-2 core products should we focus on? Note: Targeting all offerings at once will dilute the keyword list. Please narrow to your top 1-2 priorities.',
        type: 'list',
        placeholder: 'Add a product line and press Enter',
        required: false
      },
      {
        id: 'seoGoals',
        title: '5. SEO Goals & Conversion Action',
        subtitle: 'What is your overall SEO goal, and what is the main conversion action you want a visitor to take? Example: SEO Goal: Generate traffic from people researching solar energy and capture qualified leads. Conversion Action: User submission of the lead form requesting quotes or consultation.',
        type: 'textarea',
        placeholder: 'Describe your SEO goals and the main conversion action...',
        required: true
      },
      {
        id: 'mustRankKeywords',
        title: '6. "Must-Rank" Keywords (Optional)',
        subtitle: 'Are there any specific keywords you absolutely must rank for? Example: "Solar cell installation" or "Solar EV charger".',
        type: 'list',
        placeholder: 'Add a keyword and press Enter',
        required: false
      }
    ]
  }
];

const initialFormData: Record<string, any> = {
  businessName: '',
  websiteUrl: '',
  businessDescription: '',
  seoGoals: '',
  mustRankKeywords: [],
  focusProductLines: [],
};

const mockFormData: Record<string, any> = {
  businessName: 'SolarTH',
  websiteUrl: 'https://solarth.co.th',
  businessDescription: 'SolarTH is an online platform that aggregates solar installation companies in Thailand. It allows consumers (homeowners, businesses, factories) to search, compare prices, and find qualified installers for their solar system needs.',
  seoGoals: 'SEO Goal: Generate traffic from people researching solar energy and capture qualified leads from consumers looking to install solar systems.\nConversion Action: User submission of the lead form requesting quotes or consultation.',
  mustRankKeywords: [
    'Solar cell installation',
    'Solar EV charger',
    'Solar rooftop',
  ],
  focusProductLines: [
    'Solar Cell',
  ],
};

type AppPhase = 'form' | 'generating-keywords' | 'keywords-done' | 'generating-sitemap' | 'all-done';

export default function App() {
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialFormData });
  const [phase, setPhase] = useState<AppPhase>('form');
  const [streamText, setStreamText] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'keywords' | 'sitemap'>('keywords');
  const [keywordResult, setKeywordResult] = useState<string>('');
  const [sitemapResult, setSitemapResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('generating-keywords');
    setStreamText('');
    setActiveTools([]);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      await streamKeywords(formData, {
        onText: (text) => setStreamText((prev) => prev + text),
        onTool: (toolName) => setActiveTools((prev) => [...prev, toolName]),
        onDone: (result) => {
          setKeywordResult(result);
          setPhase('keywords-done');
          setStreamText('');
        },
        onError: (err) => {
          setError(err);
          setPhase('form');
        },
      });
    } catch (err) {
      setError((err as Error).message);
      setPhase('form');
    }
  };

  const handleGenerateSitemap = async () => {
    setPhase('generating-sitemap');
    setStreamText('');
    setActiveTools([]);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const businessContext = `${formData.businessName} — ${formData.businessDescription}`;

    try {
      await streamSitemap(keywordResult, businessContext, {
        onText: (text) => setStreamText((prev) => prev + text),
        onTool: (toolName) => setActiveTools((prev) => [...prev, toolName]),
        onDone: (result) => {
          setSitemapResult(result);
          setPhase('all-done');
          setStreamText('');
        },
        onError: (err) => {
          setError(err);
          setPhase('keywords-done');
        },
      });
    } catch (err) {
      setError((err as Error).message);
      setPhase('keywords-done');
    }
  };

  const handleStartOver = () => {
    setFormData({ ...initialFormData });
    setPhase('form');
    setStreamText('');
    setActiveTools([]);
    setKeywordResult('');
    setSitemapResult('');
    setError('');
  };

  // --- Generating / Streaming View ---
  if (phase === 'generating-keywords' || phase === 'generating-sitemap') {
    const label = phase === 'generating-keywords' ? 'Generating Keyword Map' : 'Generating Sitemap';
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Header />
        <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] shadow-sm border border-slate-200/60 p-8 sm:p-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              <h2 className="text-2xl font-bold text-slate-900">{label}...</h2>
            </div>

            {activeTools.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {activeTools.slice(-5).map((tool, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {tool}
                  </span>
                ))}
              </div>
            )}

            <div className="bg-slate-50 rounded-xl p-6 max-h-[60vh] overflow-y-auto">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                {streamText || 'Connecting to agent...'}
              </pre>
            </div>
          </motion.div>
        </div>
        </div>
      </div>
    );
  }

  // --- Keywords Done — show results + option to generate sitemap ---
  if (phase === 'keywords-done') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Header />
        <div className="py-8 px-4 sm:px-6">
        <div className="max-w-[95vw] mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Keyword Map Ready</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleGenerateSitemap}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-slate-900/20"
                >
                  Generate Sitemap
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleStartOver}
                  className="px-6 py-3 bg-white text-slate-700 rounded-xl font-medium border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>

            <KeywordTable data={keywordResult} />
          </motion.div>
        </div>
        </div>
      </div>
    );
  }

  // --- All Done — show both results ---
  if (phase === 'all-done') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Header />
        <div className="py-8 px-4 sm:px-6">
        <div className="max-w-[95vw] mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">SEO Plan Complete</h2>
              </div>
              <button
                onClick={handleStartOver}
                className="px-6 py-3 bg-white text-slate-700 rounded-xl font-medium border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Start Over
              </button>
            </div>

            <div className="inline-flex items-center p-0.5 mb-6 rounded-lg bg-gray-200/60">
              <button
                onClick={() => setActiveTab('keywords')}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                  activeTab === 'keywords'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Keyword Map
              </button>
              <button
                onClick={() => setActiveTab('sitemap')}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                  activeTab === 'sitemap'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sitemap Plan
              </button>
            </div>

            {activeTab === 'keywords' && <KeywordTable data={keywordResult} />}
            {activeTab === 'sitemap' && <SitemapTable data={sitemapResult} />}
          </motion.div>
        </div>
        </div>
      </div>
    );
  }

  // --- Form View ---
  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <Header />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            SEO Keyword Planner
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Fill out this brief to help us target the most valuable search terms for your campaign.
          </p>
          <button
            type="button"
            onClick={() => setFormData({ ...mockFormData })}
            className="mt-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Fill Mock Data
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm"
          >
            {error}
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {steps.map((step, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              key={step.id}
              className="bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden"
            >
              <div className="p-8 sm:p-10">
                <div className="mb-8 border-b border-slate-100 pb-6">
                  <h2 className="text-2xl font-bold text-slate-900">{step.title}</h2>
                  {step.description && <p className="mt-2 text-slate-500">{step.description}</p>}
                </div>

                <div className="space-y-10">
                  {step.fields.map((field) => (
                    <div key={field.id} className="space-y-4">
                      <div>
                        <label className="block text-base font-semibold text-slate-900">
                          {field.title}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {field.subtitle && (
                          <p className="mt-1 text-sm text-slate-500">{field.subtitle}</p>
                        )}
                      </div>
                      <div className="pt-1">
                        {field.type === 'input' && (
                          <Input
                            type={field.inputType || 'text'}
                            placeholder={field.placeholder}
                            value={formData[field.id] || ''}
                            onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                            required={field.required}
                            className="bg-slate-50 border-slate-200 focus:bg-white"
                          />
                        )}
                        {field.type === 'textarea' && (
                          <TextArea
                            placeholder={field.placeholder}
                            value={formData[field.id] || ''}
                            onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                            required={field.required}
                            className="bg-slate-50 border-slate-200 focus:bg-white min-h-[120px]"
                          />
                        )}
                        {field.type === 'list' && (
                          <DynamicList
                            placeholder={field.placeholder}
                            items={formData[field.id] || []}
                            onChange={(items) => setFormData({ ...formData, [field.id]: items })}
                          />
                        )}
                        {field.type === 'radio' && field.options && (
                          <RadioGroup
                            options={field.options}
                            value={formData[field.id] || ''}
                            onChange={(val) => setFormData({ ...formData, [field.id]: val })}
                          />
                        )}
                        {field.type === 'select' && field.options && (
                          <Select
                            value={formData[field.id] || []}
                            onChange={(val) => setFormData({ ...formData, [field.id]: val })}
                            options={field.options}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Submit Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: steps.length * 0.1 }}
            className="flex justify-center pt-8 pb-12"
          >
            <button
              type="submit"
              className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-slate-900/20 w-full sm:w-auto min-w-[250px]"
            >
              Submit Project Brief
            </button>
          </motion.div>
        </form>
      </div>
      </div>
    </div>
  );
}
