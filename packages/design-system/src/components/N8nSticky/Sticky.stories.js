import { action } from '@storybook/addon-actions';
import N8nSticky from './Sticky.vue';

export default {
	title: 'Atoms/Sticky',
	component: N8nSticky,
	argTypes: {
		content: {
			control: {
				control: 'text',
			},
		},
		height: {
			control: {
				control: 'number',
			},
		},
		minHeight: {
			control: {
				control: 'number',
			},
		},
		minWidth: {
			control: {
				control: 'number',
			},
		},
		readOnly: {
			control: {
				control: 'Boolean',
			},
		},
		width: {
			control: {
				control: 'number',
			},
		},
	},
};

const methods = {
	onInput: action('input'),
	onResize: action('resize'),
	onResizeEnd: action('resizeend'),
	onResizeStart: action('resizestart'),
};

const Template = (args, { argTypes }) => ({
	props: Object.keys(argTypes),
	components: {
		N8nSticky,
	},
	template:
		'<n8n-sticky v-bind="$props"  @resize="onResize" @resizeend="onResizeEnd" @resizeStart="onResizeStart" @input="onInput"></n8n-sticky>',
	methods,
});

export const Sticky = Template.bind({});
Sticky.args = {
	height: 160,
	width: 150,
	content: `## I'm a note \n**Double click** to edit me. [Guide](https://docs.n8n.io/workflows/workflow-notes/)`,
	defaultText: `## I'm a note \n**Double click** to edit me. [Guide](https://docs.n8n.io/workflows/workflow-notes/)`,
	isEditable: false,
	minHeight: 80,
	minWidth: 150,
	readOnly: false,
};
