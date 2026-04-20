import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Check, Upload, ArrowRight } from 'lucide-react';
import { WizardConfig, WizardStep } from '../types';

interface WizardPreviewProps {
  config: WizardConfig;
  onComplete?: (data: Record<string, any>) => void;
}

export default function WizardPreview({ config, onComplete }: WizardPreviewProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isCompleted, setIsCompleted] = useState(false);

  const currentStep = config.steps[currentStepIndex];
  if (!currentStep) {
    return (
      <div className="w-full max-w-2xl rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-xl">
        <h2 className="text-xl font-bold text-gray-900">Add your first step</h2>
        <p className="mt-3 text-sm text-gray-500">
          This preview will come alive as soon as the wizard has at least one step.
        </p>
      </div>
    );
  }

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === config.steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      setIsCompleted(true);
      onComplete?.(formData);
    } else {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const updateField = (val: any) => {
    setFormData({ ...formData, [currentStep.id]: val });
  };

  const progress = ((currentStepIndex + 1) / config.steps.length) * 100;

  if (isCompleted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center p-12 text-center space-y-4 bg-white rounded-3xl shadow-xl border border-gray-100"
      >
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
          <Check size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">All Set!</h2>
        <p className="text-gray-500 max-w-sm">
          You've completed the {config.name} wizard. Your response has been captured.
        </p>
        <button 
          onClick={() => {
            setIsCompleted(false);
            setCurrentStepIndex(0);
            setFormData({});
          }}
          className="mt-6 px-6 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
        >
          Start Over
        </button>
      </motion.div>
    );
  }

  return (
    <div 
      className="w-full max-w-2xl mx-auto overflow-hidden bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col"
      style={{ fontFamily: config.branding.fontFamily }}
    >
      {/* Header */}
      <div className="p-8 pb-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            {config.branding.logoUrl && (
              <img src={config.branding.logoUrl} className="h-8 w-8 object-contain" referrerPolicy="no-referrer" />
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none">{config.name}</h1>
              <p className="text-xs text-gray-400 mt-1">Step {currentStepIndex + 1} of {config.steps.length}</p>
            </div>
          </div>
          <div className="h-2 w-32 bg-gray-100 rounded-full overflow-hidden">
            <motion.div 
              className="h-full"
              style={{ backgroundColor: config.branding.primaryColor }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 pt-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{currentStep.title}</h2>
              <p className="text-gray-500 mt-2">{currentStep.description}</p>
            </div>

            <div className="py-4">
              {currentStep.type === 'text' && (
                <div className="prose prose-sm text-gray-600">
                  {currentStep.content}
                </div>
              )}

              {currentStep.type === 'input' && (
                <input
                  type="text"
                  placeholder={currentStep.placeholder || "Your answer..."}
                  value={formData[currentStep.id] || ''}
                  onChange={(e) => updateField(e.target.value)}
                  className="w-full p-4 text-lg border-2 border-gray-100 rounded-2xl focus:border-indigo-500 focus:outline-none transition-colors"
                  style={{ borderRadius: config.branding.borderRadius }}
                />
              )}

              {currentStep.type === 'choice' && (
                <div className="grid grid-cols-1 gap-3">
                  {currentStep.options?.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => updateField(opt)}
                      className={`p-4 text-left border-2 rounded-2xl transition-all flex justify-between items-center
                        ${formData[currentStep.id] === opt 
                          ? 'border-indigo-500 bg-indigo-50/50' 
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                        }
                      `}
                      style={{ borderRadius: config.branding.borderRadius }}
                    >
                      <span className="font-medium">{opt}</span>
                      {formData[currentStep.id] === opt && <Check size={18} className="text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}

              {currentStep.type === 'ai-prompt' && (
                <div className="space-y-4">
                  <textarea
                    placeholder={currentStep.placeholder || "Enter instructions..."}
                    value={formData[currentStep.id] || ''}
                    onChange={(e) => updateField(e.target.value)}
                    className="w-full min-h-[150px] p-4 text-gray-700 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                    style={{ borderRadius: config.branding.borderRadius }}
                  />
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Check size={14} className="text-green-500" />
                    AI-powered enhancement will be applied to this field.
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer / Navigation */}
      <div className="p-8 pt-4 border-t border-gray-50 bg-gray-50/50 flex justify-between items-center">
        <button
          onClick={handleBack}
          disabled={isFirstStep}
          className={`px-6 py-3 flex items-center gap-2 font-medium transition-colors
            ${isFirstStep ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-900'}
          `}
        >
          <ChevronLeft size={20} />
          Back
        </button>

        <button
          onClick={handleNext}
          className="px-8 py-3 flex items-center gap-2 font-bold text-white rounded-2xl shadow-lg transition-all active:scale-95 hover:shadow-xl"
          style={{ 
            backgroundColor: config.branding.primaryColor,
            borderRadius: config.branding.borderRadius 
          }}
        >
          {isLastStep ? 'Complete' : 'Next'}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
