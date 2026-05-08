from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from django.template import Template, Context
from .models import EmailTemplate
from .serializers import EmailTemplateSerializer, EmailTemplateListSerializer, PreviewSerializer


class EmailTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'subject']
    ordering_fields = ['name', 'created_at', 'updated_at']
    ordering = ['-updated_at']

    def get_queryset(self):
        return EmailTemplate.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'list':
            return EmailTemplateListSerializer
        return EmailTemplateSerializer

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        template = self.get_object()
        serializer = PreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        variables = serializer.validated_data['variables']

        try:
            t = Template(template.html_content)
            c = Context(variables)
            rendered = t.render(c)
            return Response({
                'subject': template.subject,
                'html': rendered,
                'text': template.text_content,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        template = self.get_object()
        template.pk = None
        template.name = f'{template.name} (Copy)'
        template.save()
        return Response(EmailTemplateSerializer(template, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)
