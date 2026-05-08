import smtplib
from email.mime.text import MIMEText
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.filters import SearchFilter, OrderingFilter
from .models import SMTPAccount
from .serializers import SMTPAccountSerializer, SMTPTestSerializer


class SMTPAccountViewSet(viewsets.ModelViewSet):
    serializer_class = SMTPAccountSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'host', 'from_email']
    ordering_fields = ['name', 'weight', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return SMTPAccount.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        smtp_account = self.get_object()
        serializer = SMTPTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        test_email = serializer.validated_data['test_email']

        try:
            msg = MIMEText('<h2>SMTP Test Successful!</h2><p>Your SMTP account is configured correctly.</p>', 'html')
            msg['Subject'] = f'SMTP Test - {smtp_account.name}'
            msg['From'] = f'{smtp_account.from_name} <{smtp_account.from_email}>'
            msg['To'] = test_email

            if smtp_account.use_ssl:
                server = smtplib.SMTP_SSL(smtp_account.host, smtp_account.port, timeout=15)
            else:
                server = smtplib.SMTP(smtp_account.host, smtp_account.port, timeout=15)
                if smtp_account.use_tls:
                    server.starttls()

            if smtp_account.username and smtp_account.password:
                server.login(smtp_account.username, smtp_account.password)

            server.sendmail(smtp_account.from_email, [test_email], msg.as_string())
            server.quit()

            smtp_account.last_tested_at = timezone.now()
            smtp_account.last_test_success = True
            smtp_account.save(update_fields=['last_tested_at', 'last_test_success'])

            return Response({'success': True, 'message': f'Test email sent to {test_email}'})

        except smtplib.SMTPAuthenticationError:
            smtp_account.last_tested_at = timezone.now()
            smtp_account.last_test_success = False
            smtp_account.save(update_fields=['last_tested_at', 'last_test_success'])
            return Response({'success': False, 'error': 'Authentication failed. Check username/password.'},
                            status=status.HTTP_400_BAD_REQUEST)
        except smtplib.SMTPConnectError:
            smtp_account.last_tested_at = timezone.now()
            smtp_account.last_test_success = False
            smtp_account.save(update_fields=['last_tested_at', 'last_test_success'])
            return Response({'success': False, 'error': 'Cannot connect to SMTP server. Check host/port.'},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            smtp_account.last_tested_at = timezone.now()
            smtp_account.last_test_success = False
            smtp_account.save(update_fields=['last_tested_at', 'last_test_success'])
            return Response({'success': False, 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        accounts = self.get_queryset()
        total_weight = sum(a.weight for a in accounts if a.is_active)
        result = []
        for account in accounts:
            prob = round((account.weight / total_weight * 100), 1) if total_weight > 0 and account.is_active else 0
            result.append({
                'id': account.id,
                'name': account.name,
                'from_email': account.from_email,
                'weight': account.weight,
                'probability': prob,
                'is_active': account.is_active,
                'last_tested_at': account.last_tested_at,
                'last_test_success': account.last_test_success,
            })
        return Response(result)
