

AGENT_MAPPING = {
    # Elements Analyzer Agents
    "anchoring_target": {
        "key": "anchoring_target",
        "label": "Target Anchoring Analysis",
        "description": "Extract information based on pragmatic intention analysis, parse pragmatic intentions and define core goals",
        "category": "elements_analysis",
    },
    "activate_role": {
        "key": "activate_role",
        "label": "Role Activation Analysis",
        "description": "Assign appropriate roles, thinking patterns and domain knowledge to the large model",
        "category": "elements_analysis",
    },
    "disassembly_task": {
        "key": "disassembly_task",
        "label": "Task Decomposition Analysis",
        "description": "Decompose the task requirements prompted by users according to the hierarchical structure",
        "category": "elements_analysis",
    },
    "expand_thinking": {
        "key": "expand_thinking",
        "label": "Thinking Framework Analysis",
        "description": "Automatically match the optimal thinking framework (divergent/convergent/cross-border)",
        "category": "elements_analysis",
    },
    "focus_subject": {
        "key": "focus_subject",
        "label": "Subject Focus Analysis",
        "description": "Extract the semantic framework, define the topic prototype and topic anchor points",
        "category": "elements_analysis",
    },
    "input_extract": {
        "key": "input_extract",
        "label": "Input Data Extraction",
        "description": "Accurately analyze the original text content that needs to be processed from the prompts",
        "category": "elements_analysis",
    },
    "examples_extract": {
        "key": "examples_extract",
        "label": "Examples Extraction",
        "description": "Extract the examples provided by the user from the prompts",
        "category": "elements_analysis",
    },
    # Structure Checker Agents
    "check_structure": {
        "key": "check_structure",
        "label": "Structure Validation",
        "description": "Check and validate the structural completeness of prompts",
        "category": "structure_checking",
    },
    "thinking_structure": {
        "key": "thinking_structure",
        "label": "Thinking Structure Analysis",
        "description": "Analyze and optimize the thinking structure of prompts",
        "category": "structure_checking",
    },
    # Prompt Generator Agents
    "structuring_prompt": {
        "key": "structuring_prompt",
        "label": "Prompt Structuring",
        "description": "Generate well-structured prompts based on analysis results",
        "category": "prompt_generation",
    },
    # Prompt Optimizer Agents
    "detect_trap": {
        "key": "detect_trap",
        "label": "Trap Detection",
        "description": "Detect and fix potential issues in prompts that may lead to poor results",
        "category": "prompt_optimization",
    },
    "verification_logic": {
        "key": "verification_logic",
        "label": "Logic Verification",
        "description": "Verify and improve the logical consistency of prompts",
        "category": "prompt_optimization",
    },
    "optimizing_representation": {
        "key": "optimizing_representation",
        "label": "Representation Optimization",
        "description": "Optimize the representation and clarity of prompt content",
        "category": "prompt_optimization",
    },
    "review_progressive": {
        "key": "review_progressive",
        "label": "Progressive Review",
        "description": "Conduct progressive review and refinement of prompts",
        "category": "prompt_optimization",
    },
    "balance_focus": {
        "key": "balance_focus",
        "label": "Focus Balancing",
        "description": "Balance different aspects and focus areas in prompts",
        "category": "prompt_optimization",
    },
    "generate_optimization_plan": {
        "key": "generate_optimization_plan",
        "label": "Optimization Planning",
        "description": "Generate comprehensive optimization plans for prompts",
        "category": "prompt_optimization",
    },
    "optimization_thinking": {
        "key": "optimization_thinking",
        "label": "Optimization Thinking",
        "description": "Generate a concise thinking process explaining optimization changes",
        "category": "prompt_optimization",
    },
    # Prompt Optimizer 2 Agents (Suggestion-based)
    "detect_trap_suggestion": {
        "key": "detect_trap_suggestion",
        "label": "Trap Detection (Suggestions)",
        "description": "Provide suggestions for detecting and avoiding prompt traps",
        "category": "prompt_optimization_v2",
    },
    "verification_logic_suggestion": {
        "key": "verification_logic_suggestion",
        "label": "Logic Verification (Suggestions)",
        "description": "Provide suggestions for improving prompt logic",
        "category": "prompt_optimization_v2",
    },
    "optimizing_representation_suggestion": {
        "key": "optimizing_representation_suggestion",
        "label": "Representation Optimization (Suggestions)",
        "description": "Provide suggestions for optimizing prompt representation",
        "category": "prompt_optimization_v2",
    },
    "review_progressive_suggestion": {
        "key": "review_progressive_suggestion",
        "label": "Progressive Review (Suggestions)",
        "description": "Provide suggestions for progressive prompt improvement",
        "category": "prompt_optimization_v2",
    },
    "balance_focus_suggestion": {
        "key": "balance_focus_suggestion",
        "label": "Focus Balancing (Suggestions)",
        "description": "Provide suggestions for balancing prompt focus areas",
        "category": "prompt_optimization_v2",
    },
    "select_optimization_agent": {
        "key": "select_optimization_agent",
        "label": "Optimization Agent Selection",
        "description": "Select the most appropriate optimization agents for specific prompts",
        "category": "prompt_optimization_v2",
    },
    "optimize_prompt_by_plan": {
        "key": "optimize_prompt_by_plan",
        "label": "Plan-based Optimization",
        "description": "Optimize prompts according to generated optimization plans",
        "category": "prompt_optimization_v2",
    },
    # Post Processor Agents
    "simulate_style": {
        "key": "simulate_style",
        "label": "Style Simulation",
        "description": "Apply specific writing styles and tones to prompts",
        "category": "post_processing",
    },
    "merge_emotion": {
        "key": "merge_emotion",
        "label": "Emotion Integration",
        "description": "Integrate emotional elements into prompts for better engagement",
        "category": "post_processing",
    },
    "add_rhetoric": {
        "key": "add_rhetoric",
        "label": "Rhetorical Enhancement",
        "description": "Add rhetorical devices and persuasive elements to prompts",
        "category": "post_processing",
    },
    "transform_syntax": {
        "key": "transform_syntax",
        "label": "Syntax Transformation",
        "description": "Transform and optimize the syntactic structure of prompts",
        "category": "post_processing",
    },
}

# 分类定义
AGENT_CATEGORIES = {
    "elements_analysis": "Elements Analysis",
    "structure_checking": "Structure Checking",
    "prompt_generation": "Prompt Generation",
    "prompt_optimization": "Prompt Optimization",
    "prompt_optimization_v2": "Advanced Optimization",
    "post_processing": "Post Processing",
}

# 分类与Agent的映射
CATEGORY_AGENTS = {
    "elements_analysis": [
        "anchoring_target",
        "activate_role",
        "disassembly_task",
        "expand_thinking",
        "focus_subject",
        "input_extract",
        "examples_extract",
    ],
    "structure_checking": ["check_structure", "thinking_structure"],
    "prompt_generation": ["structuring_prompt"],
    "prompt_optimization": [
        "detect_trap",
        "verification_logic",
        "optimizing_representation",
        "review_progressive",
        "balance_focus",
        "generate_optimization_plan",
        "optimization_thinking",
    ],
    "prompt_optimization_v2": [
        "detect_trap_suggestion",
        "verification_logic_suggestion",
        "optimizing_representation_suggestion",
        "review_progressive_suggestion",
        "balance_focus_suggestion",
        "select_optimization_agent",
        "optimize_prompt_by_plan",
    ],
    "post_processing": [
        "simulate_style",
        "merge_emotion",
        "add_rhetoric",
        "transform_syntax",
    ],
}


def get_agent_info(agent_key: str) -> dict:
    return AGENT_MAPPING.get(agent_key, {})


def get_agents_by_category(category: str) -> list:
    return CATEGORY_AGENTS.get(category, [])


def get_all_agents() -> dict:
    return AGENT_MAPPING


def get_all_categories() -> dict:
    return AGENT_CATEGORIES


def get_category_agents_mapping() -> dict:
    return CATEGORY_AGENTS
